import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLocal, snapToAgendaSlot, toNoZ } from "@/lib/agenda/agendaContract";

export const STAFF_SLOT_CONFLICT_MESSAGE =
  "Collaboratore già impegnato in questa fascia oraria";

/** Appuntamenti che non occupano agenda (nessun overlap). */
const TERMINAL_APPOINTMENT_STATUSES = new Set([
  "cancelled",
  "no_show",
  "noshow",
  "done",
]);

export type AssertStaffSlotFreeInput = {
  supabase: SupabaseClient;
  salonId: number;
  staffId: number;
  startTime: string;
  endTime: string;
  excludeAppointmentId?: number | null;
  excludeLineId?: number | null;
};

export function computeLineEndTime(startTime: string, durationMinutes: number): string {
  const startMs = parseLocal(startTime).getTime();
  return toNoZ(snapToAgendaSlot(new Date(startMs + durationMinutes * 60_000)));
}

function lineEndMs(startTime: string, durationMinutes: number): number {
  return parseLocal(startTime).getTime() + durationMinutes * 60_000;
}

/** [startA, endA) vs [startB, endB) */
function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function isTerminalAppointmentStatus(status: string): boolean {
  return TERMINAL_APPOINTMENT_STATUSES.has(status.trim().toLowerCase());
}

export function isStaffSlotConflictError(e: unknown): boolean {
  return e instanceof Error && e.message === STAFF_SLOT_CONFLICT_MESSAGE;
}

/**
 * Finestra query su appointment_services.start_time:
 * giorno/i dello slot + giorno precedente (righe notturne che sforano).
 */
export function computeOverlapQueryWindow(
  startTime: string,
  endTime: string,
): { windowStart: string; windowEnd: string } {
  const start = parseLocal(startTime);
  const end = parseLocal(endTime);

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const windowStartDay = new Date(startDay);
  windowStartDay.setDate(windowStartDay.getDate() - 1);

  const windowEndDay = new Date(endDay);
  windowEndDay.setHours(23, 59, 59, 999);

  return {
    windowStart: toNoZ(
      new Date(
        windowStartDay.getFullYear(),
        windowStartDay.getMonth(),
        windowStartDay.getDate(),
        0,
        0,
        0,
        0,
      ),
    ),
    windowEnd: toNoZ(windowEndDay),
  };
}

/**
 * Verifica su DB che lo staff non abbia righe agenda sovrapposte nello stesso salone.
 * @throws Error con STAFF_SLOT_CONFLICT_MESSAGE se c'è overlap
 */
export async function assertStaffSlotFree(input: AssertStaffSlotFreeInput): Promise<void> {
  const {
    supabase,
    salonId,
    staffId,
    startTime,
    endTime,
    excludeAppointmentId,
    excludeLineId,
  } = input;

  const newStartMs = parseLocal(startTime).getTime();
  const newEndMs = parseLocal(endTime).getTime();
  if (!Number.isFinite(newStartMs) || !Number.isFinite(newEndMs) || newEndMs <= newStartMs) {
    throw new Error("Intervallo orario non valido");
  }

  const { windowStart, windowEnd } = computeOverlapQueryWindow(startTime, endTime);

  const { data: rows, error } = await supabase
    .from("appointment_services")
    .select(
      `
      id,
      appointment_id,
      start_time,
      duration_minutes,
      appointments!inner (
        id,
        salon_id,
        status
      )
    `,
    )
    .eq("staff_id", staffId)
    .eq("appointments.salon_id", salonId)
    .gte("start_time", windowStart)
    .lte("start_time", windowEnd);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of rows ?? []) {
    const lineId = Number((row as { id?: unknown }).id);
    const appointmentId = Number((row as { appointment_id?: unknown }).appointment_id);
    if (!Number.isInteger(lineId) || lineId <= 0) continue;
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) continue;

    if (excludeLineId != null && lineId === excludeLineId) continue;
    if (excludeAppointmentId != null && appointmentId === excludeAppointmentId) continue;

    const apptRaw = (row as { appointments?: { status?: unknown } | { status?: unknown }[] })
      .appointments;
    const appt = Array.isArray(apptRaw) ? apptRaw[0] : apptRaw;
    const status = String(appt?.status ?? "");
    if (isTerminalAppointmentStatus(status)) continue;

    const existingStart = String((row as { start_time?: unknown }).start_time ?? "");
    const duration = Number((row as { duration_minutes?: unknown }).duration_minutes);
    if (!existingStart || !Number.isFinite(duration) || duration <= 0) continue;

    const existingStartMs = parseLocal(existingStart).getTime();
    const existingEndMs = lineEndMs(existingStart, duration);

    if (intervalsOverlap(newStartMs, newEndMs, existingStartMs, existingEndMs)) {
      throw new Error(STAFF_SLOT_CONFLICT_MESSAGE);
    }
  }
}
