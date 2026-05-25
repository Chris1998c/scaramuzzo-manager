import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseLocal,
  snapToAgendaSlot,
  syncAppointmentHeaderFromDb,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import {
  assertStaffBelongsToSalon,
  resolveAgendaServiceLines,
} from "@/lib/agenda/appointmentServerValidation";
import {
  assertStaffScheduledForStartTime,
  isoDateFromAgendaStartTime,
} from "@/lib/agenda/assertStaffSchedule";
import {
  assertBatchInternalStaffSlotsFree,
  assertStaffSlotFree,
  computeLineEndTime,
  isStaffSlotConflictFromDbError,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import { fetchOperationalCalendarSnapshot } from "@/lib/salonOperationalCalendar";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";
import { loadAndEvaluateCustomerBookingPiegaRule } from "@/lib/customer-app/customerBookingServiceRules";
import type { ParsedCustomerAppBookingBody } from "@/lib/customer-app/parseCustomerAppBookingBody";

export type CustomerAppBookingServiceDto = {
  service_id: number;
  staff_id: number;
  start_time: string;
  end_time: string;
  duration: number;
  price: number;
};

export type CustomerAppBookingDto = {
  id: number;
  salon_id: number;
  start_time: string;
  end_time: string;
  status: string;
  source: "customer_app";
  notes: string | null;
  services: CustomerAppBookingServiceDto[];
};

export class CustomerAppBookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerAppBookingConflictError";
  }
}

export class CustomerAppBookingValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomerAppBookingValidationError";
    this.status = status;
  }
}

async function assertServicesBookableForCustomerApp(
  admin: SupabaseClient,
  serviceIds: number[],
): Promise<void> {
  const unique = [...new Set(serviceIds)];
  const { data, error } = await admin
    .from("services")
    .select("id")
    .in("id", unique)
    .eq("active", true)
    .eq("visible_in_customer_app", true);

  if (error) {
    throw new Error(`services: ${error.message}`);
  }

  const found = new Set(
    (data ?? [])
      .map((r) => Number((r as { id: unknown }).id))
      .filter((id) => Number.isInteger(id) && id > 0),
  );

  for (const id of unique) {
    if (!found.has(id)) {
      throw new CustomerAppBookingValidationError(
        `Servizio non prenotabile dall'app (id ${id}).`,
      );
    }
  }
}

export async function createCustomerAppBooking(
  admin: SupabaseClient,
  customerId: string,
  input: ParsedCustomerAppBookingBody,
): Promise<CustomerAppBookingDto> {
  const { salonId, serviceIds, staffId, startTime, notes } = input;

  await assertServicesBookableForCustomerApp(admin, serviceIds);

  const piegaRule = await loadAndEvaluateCustomerBookingPiegaRule(admin, serviceIds);
  if (!piegaRule.ok) {
    throw new CustomerAppBookingValidationError(piegaRule.message);
  }

  const staffGate = await assertStaffBelongsToSalon(admin, staffId, salonId);
  if (!staffGate.ok) {
    throw new CustomerAppBookingValidationError(staffGate.error, staffGate.status);
  }

  const resolved = await resolveAgendaServiceLines(admin, salonId, serviceIds);
  if (!resolved.ok) {
    throw new CustomerAppBookingValidationError(resolved.error, resolved.status);
  }

  const normalizedLines: Array<{
    service_id: number;
    staff_id: number;
    duration_minutes: number;
    price: number;
    vat_rate: number;
  }> = [];

  for (const serviceId of serviceIds) {
    const line = resolved.data.get(serviceId);
    if (!line) {
      throw new CustomerAppBookingValidationError(`Servizio non valido (id ${serviceId}).`);
    }
    normalizedLines.push({
      service_id: serviceId,
      staff_id: staffId,
      duration_minutes: line.duration_minutes,
      price: line.price,
      vat_rate: line.vat_rate,
    });
  }

  const snappedStart = startTime;
  const scheduleMap = await fetchStaffScheduleForSalon(admin, salonId);
  const opIsoDate = isoDateFromAgendaStartTime(snappedStart);
  const operationalSnapshot =
    opIsoDate != null
      ? await fetchOperationalCalendarSnapshot(admin, salonId, opIsoDate, [staffId])
      : undefined;

  let cursorMs = parseLocal(snappedStart).getTime();
  const batchLines: Array<{
    staffId: number | null;
    startTime: string;
    durationMinutes: number;
  }> = [];

  for (const line of normalizedLines) {
    const lineStart = toNoZ(snapToAgendaSlot(new Date(cursorMs)));
    batchLines.push({
      staffId: line.staff_id,
      startTime: lineStart,
      durationMinutes: line.duration_minutes,
    });
    cursorMs += line.duration_minutes * 60_000;
  }

  try {
    assertBatchInternalStaffSlotsFree(batchLines);
  } catch {
    throw new CustomerAppBookingConflictError(STAFF_SLOT_CONFLICT_MESSAGE);
  }

  cursorMs = parseLocal(snappedStart).getTime();
  for (const line of normalizedLines) {
    const lineStart = toNoZ(snapToAgendaSlot(new Date(cursorMs)));
    const lineEnd = computeLineEndTime(lineStart, line.duration_minutes);
    await assertStaffScheduledForStartTime({
      supabase: admin,
      salonId,
      staffId: line.staff_id,
      startTime: lineStart,
      durationMinutes: line.duration_minutes,
      scheduleMap,
      operationalSnapshot,
      operationalIsoDate: opIsoDate ?? undefined,
    });
    await assertStaffSlotFree({
      supabase: admin,
      salonId,
      staffId: line.staff_id,
      startTime: lineStart,
      endTime: lineEnd,
    });
    cursorMs += line.duration_minutes * 60_000;
  }

  const totalDurationMs = cursorMs - parseLocal(snappedStart).getTime();
  const headerEndTime = toNoZ(
    snapToAgendaSlot(new Date(parseLocal(snappedStart).getTime() + totalDurationMs)),
  );

  let appointmentIdCreated: number | null = null;

  try {
    const { data: appData, error: appErr } = await admin
      .from("appointments")
      .insert({
        salon_id: salonId,
        customer_id: customerId,
        staff_id: staffId,
        start_time: snappedStart,
        end_time: headerEndTime,
        status: "scheduled",
        source: "customer_app",
        notes,
      })
      .select("id, status, source")
      .single();

    if (appErr) {
      throw new Error(appErr.message);
    }

    const appointmentId = Number((appData as { id?: unknown })?.id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      throw new Error("Creazione appuntamento fallita");
    }
    appointmentIdCreated = appointmentId;

    const serviceDtos: CustomerAppBookingServiceDto[] = [];
    cursorMs = parseLocal(snappedStart).getTime();

    for (const line of normalizedLines) {
      const lineStart = toNoZ(snapToAgendaSlot(new Date(cursorMs)));
      const lineEnd = computeLineEndTime(lineStart, line.duration_minutes);

      const { error: lineErr } = await admin.from("appointment_services").insert({
        appointment_id: appointmentId,
        service_id: line.service_id,
        staff_id: line.staff_id,
        start_time: lineStart,
        duration_minutes: line.duration_minutes,
        price: line.price,
        vat_rate: line.vat_rate,
      });

      if (lineErr) {
        if (isStaffSlotConflictFromDbError(lineErr)) {
          throw new CustomerAppBookingConflictError(STAFF_SLOT_CONFLICT_MESSAGE);
        }
        throw new Error(lineErr.message);
      }

      serviceDtos.push({
        service_id: line.service_id,
        staff_id: line.staff_id,
        start_time: lineStart,
        end_time: lineEnd,
        duration: line.duration_minutes,
        price: line.price,
      });

      cursorMs += line.duration_minutes * 60_000;
    }

    const synced = await syncAppointmentHeaderFromDb(admin, appointmentId);
    if (!synced.ok) throw synced.error;

    const { data: headerRow } = await admin
      .from("appointments")
      .select("start_time, end_time, status, source, notes")
      .eq("id", appointmentId)
      .maybeSingle();

    return {
      id: appointmentId,
      salon_id: salonId,
      start_time: String(headerRow?.start_time ?? snappedStart),
      end_time: String(headerRow?.end_time ?? headerEndTime),
      status: String(headerRow?.status ?? "scheduled"),
      source: "customer_app",
      notes: headerRow?.notes != null ? String(headerRow.notes) : notes,
      services: serviceDtos,
    };
  } catch (e) {
    if (appointmentIdCreated != null) {
      try {
        await admin.from("appointment_services").delete().eq("appointment_id", appointmentIdCreated);
      } catch {
        /* cleanup best-effort */
      }
      try {
        await admin.from("appointments").delete().eq("id", appointmentIdCreated);
      } catch {
        /* cleanup best-effort */
      }
    }
    throw e;
  }
}
