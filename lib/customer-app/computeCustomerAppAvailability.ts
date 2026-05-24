import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SLOT_MINUTES } from "@/components/agenda/utils";
import {
  nowRomeLocalDate,
  parseLocal,
  snapToAgendaSlot,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import { resolveAgendaServiceLines } from "@/lib/agenda/appointmentServerValidation";
import {
  computeLineEndTime,
  computeOverlapQueryWindow,
  isTerminalAppointmentStatus,
  staffSlotIntervalsOverlap,
} from "@/lib/agenda/assertStaffSlotFree";
import {
  fetchOperationalCalendarSnapshot,
  resolveStaffAvailabilityForDate,
} from "@/lib/salonOperationalCalendar";
import { fetchStaffScheduleForSalon, salonDefaultScheduleWindow } from "@/lib/staffSchedule";
import { fetchActiveStaffIdsForSalon } from "@/lib/staffForSalon";

export type CustomerAppAvailabilitySlot = {
  start_time: string;
  end_time: string;
  staff_id: number;
};

/** Limite risposta per evitare payload eccessivi (≈ 1 giorno × più staff). */
export const MAX_CUSTOMER_AVAILABILITY_SLOTS = 80;

type BusyInterval = { startMs: number; endMs: number };

function minutesToAgendaStart(isoDate: string, totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${isoDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function slotOverlapsBusy(
  startMs: number,
  endMs: number,
  busy: BusyInterval[],
): boolean {
  for (const b of busy) {
    if (staffSlotIntervalsOverlap(startMs, endMs, b.startMs, b.endMs)) {
      return true;
    }
  }
  return false;
}

async function loadStaffBusyIntervals(
  admin: SupabaseClient,
  salonId: number,
  staffIds: number[],
  isoDate: string,
): Promise<Map<number, BusyInterval[]>> {
  const byStaff = new Map<number, BusyInterval[]>();
  for (const id of staffIds) byStaff.set(id, []);

  if (!staffIds.length) return byStaff;

  const dayStart = minutesToAgendaStart(isoDate, 0);
  const dayEnd = minutesToAgendaStart(isoDate, 23 * 60 + 59);
  const { windowStart, windowEnd } = computeOverlapQueryWindow(dayStart, dayEnd);

  const { data: rows, error } = await admin
    .from("appointment_services")
    .select(
      `
      staff_id,
      start_time,
      duration_minutes,
      appointments!inner (
        salon_id,
        status
      )
    `,
    )
    .eq("appointments.salon_id", salonId)
    .in("staff_id", staffIds)
    .gte("start_time", windowStart)
    .lte("start_time", windowEnd);

  if (error) {
    throw new Error(`loadStaffBusyIntervals: ${error.message}`);
  }

  for (const row of rows ?? []) {
    const staffId = Number((row as { staff_id?: unknown }).staff_id);
    if (!Number.isInteger(staffId) || staffId <= 0) continue;

    const apptRaw = (row as { appointments?: { status?: unknown } | { status?: unknown }[] })
      .appointments;
    const appt = Array.isArray(apptRaw) ? apptRaw[0] : apptRaw;
    const status = String(appt?.status ?? "");
    if (isTerminalAppointmentStatus(status)) continue;

    const startStr = String((row as { start_time?: unknown }).start_time ?? "");
    const duration = Number((row as { duration_minutes?: unknown }).duration_minutes);
    if (!startStr || !Number.isFinite(duration) || duration <= 0) continue;

    const startMs = parseLocal(startStr).getTime();
    const endMs = startMs + duration * 60_000;
    if (!Number.isFinite(startMs) || endMs <= startMs) continue;

    const list = byStaff.get(staffId) ?? [];
    list.push({ startMs, endMs });
    byStaff.set(staffId, list);
  }

  return byStaff;
}

function isSlotStartInPast(startTime: string): boolean {
  const slotMs = parseLocal(startTime).getTime();
  const nowSnapped = snapToAgendaSlot(nowRomeLocalDate()).getTime();
  return slotMs < nowSnapped;
}

export type ComputeCustomerAppAvailabilityInput = {
  admin: SupabaseClient;
  salonId: number;
  isoDate: string;
  serviceIds: number[];
  staffId?: number | null;
};

/**
 * Slot disponibili (probe read-only): turni + calendario operativo + overlap agenda esistente.
 * Durata totale = somma duration_minutes da resolveAgendaServiceLines (server-side).
 */
export async function computeCustomerAppAvailability(
  input: ComputeCustomerAppAvailabilityInput,
): Promise<CustomerAppAvailabilitySlot[]> {
  const { admin, salonId, isoDate, serviceIds, staffId } = input;

  const { data: bookableRows, error: bookableErr } = await admin
    .from("services")
    .select("id")
    .in("id", serviceIds)
    .eq("active", true)
    .eq("visible_in_customer_app", true);

  if (bookableErr) {
    throw new Error(`computeCustomerAppAvailability(services): ${bookableErr.message}`);
  }

  const bookableIds = new Set(
    (bookableRows ?? [])
      .map((r) => Number((r as { id: unknown }).id))
      .filter((id) => Number.isInteger(id) && id > 0),
  );

  for (const id of serviceIds) {
    if (!bookableIds.has(id)) {
      throw new CustomerAppAvailabilityResolveError(
        `Servizio non prenotabile dall'app (id ${id}).`,
        400,
      );
    }
  }

  const resolved = await resolveAgendaServiceLines(admin, salonId, serviceIds);
  if (!resolved.ok) {
    throw new CustomerAppAvailabilityResolveError(resolved.error, resolved.status);
  }

  let totalDuration = 0;
  for (const id of serviceIds) {
    const line = resolved.data.get(id);
    if (!line) {
      throw new CustomerAppAvailabilityResolveError(
        `Servizio non valido (id ${id}).`,
        400,
      );
    }
    totalDuration += line.duration_minutes;
  }

  if (totalDuration <= 0) {
    throw new CustomerAppAvailabilityResolveError("Durata servizi non valida.", 400);
  }

  let staffIds: number[];
  if (staffId != null) {
    const allowed = await fetchActiveStaffIdsForSalon(admin, salonId);
    if (!allowed.includes(staffId)) {
      throw new CustomerAppAvailabilityResolveError(
        "Collaboratore non disponibile per questo salone.",
        400,
      );
    }
    staffIds = [staffId];
  } else {
    staffIds = await fetchActiveStaffIdsForSalon(admin, salonId);
  }

  if (!staffIds.length) return [];

  const [scheduleMap, operationalSnapshot, busyByStaff] = await Promise.all([
    fetchStaffScheduleForSalon(admin, salonId),
    fetchOperationalCalendarSnapshot(admin, salonId, isoDate, staffIds),
    loadStaffBusyIntervals(admin, salonId, staffIds, isoDate),
  ]);

  const { startMinutes: dayStartMin, endMinutes: dayEndMin } =
    salonDefaultScheduleWindow(salonId);

  const slots: CustomerAppAvailabilitySlot[] = [];

  for (const sid of staffIds) {
    for (
      let cursor = dayStartMin;
      cursor + totalDuration <= dayEndMin;
      cursor += SLOT_MINUTES
    ) {
      const startTime = toNoZ(snapToAgendaSlot(parseLocal(minutesToAgendaStart(isoDate, cursor))));
      const endTime = computeLineEndTime(startTime, totalDuration);

      if (isSlotStartInPast(startTime)) continue;

      const resolution = resolveStaffAvailabilityForDate({
        salonId,
        isoDate,
        staffId: sid,
        startTime,
        durationMinutes: totalDuration,
        salonDay: operationalSnapshot.salonDay,
        staffOverride: operationalSnapshot.staffOverrides.get(String(sid)) ?? null,
        scheduleMap,
      });

      if (!resolution.ok) continue;

      const startMs = parseLocal(startTime).getTime();
      const endMs = parseLocal(endTime).getTime();
      const busy = busyByStaff.get(sid) ?? [];
      if (slotOverlapsBusy(startMs, endMs, busy)) continue;

      slots.push({
        start_time: startTime,
        end_time: endTime,
        staff_id: sid,
      });
    }
  }

  slots.sort((a, b) => {
    const t = a.start_time.localeCompare(b.start_time);
    if (t !== 0) return t;
    return a.staff_id - b.staff_id;
  });

  return slots.slice(0, MAX_CUSTOMER_AVAILABILITY_SLOTS);
}

export class CustomerAppAvailabilityResolveError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CustomerAppAvailabilityResolveError";
    this.status = status;
  }
}
