import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { syncAppointmentHeaderFromDb } from "@/lib/agenda/agendaContract";
import {
  assertStaffBelongsToSalon,
  resolveAgendaServiceLines,
} from "@/lib/agenda/appointmentServerValidation";
import {
  assertStaffScheduledForStartTime,
  isoDateFromAgendaStartTime,
} from "@/lib/agenda/assertStaffSchedule";
import {
  assertStaffSlotFree,
  computeLineEndTime,
  isStaffSlotConflictFromDbError,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import { fetchOperationalCalendarSnapshot } from "@/lib/salonOperationalCalendar";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";
import {
  assertCustomerBookingLinesInternallyFree,
  buildCustomerBookingLines,
  totalDurationMinutesFromLines,
} from "@/lib/customer-app/buildCustomerBookingLines";
import {
  fetchCustomerAppCompositionCatalog,
  loadAndEvaluateCustomerBookingPiegaRule,
  normalizeCustomerAppBookingServiceIds,
} from "@/lib/customer-app/customerBookingServiceRules";
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

export async function createCustomerAppBooking(
  admin: SupabaseClient,
  customerId: string,
  input: ParsedCustomerAppBookingBody,
): Promise<CustomerAppBookingDto> {
  const { salonId, staffId, startTime, notes } = input;

  const compositionCatalog = await fetchCustomerAppCompositionCatalog(admin);
  const normalized = normalizeCustomerAppBookingServiceIds(
    compositionCatalog,
    input.serviceIds,
  );
  if (!normalized.ok) {
    throw new CustomerAppBookingValidationError(normalized.message);
  }
  const serviceIds = normalized.serviceIds;

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
    duration_active: number;
    duration_processing: number;
    need_processing: boolean;
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
      duration_active: line.duration_active,
      duration_processing: line.duration_processing,
      need_processing: line.need_processing,
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

  const builtLines = buildCustomerBookingLines(snappedStart, normalizedLines);

  try {
    assertCustomerBookingLinesInternallyFree(builtLines);
  } catch {
    throw new CustomerAppBookingConflictError(STAFF_SLOT_CONFLICT_MESSAGE);
  }

  for (const built of builtLines) {
    await assertStaffScheduledForStartTime({
      supabase: admin,
      salonId,
      staffId: built.staff_id,
      startTime: built.start_time,
      durationMinutes: built.duration_minutes,
      scheduleMap,
      operationalSnapshot,
      operationalIsoDate: opIsoDate ?? undefined,
    });
    await assertStaffSlotFree({
      supabase: admin,
      salonId,
      staffId: built.staff_id,
      startTime: built.start_time,
      endTime: built.end_time,
      durationMinutes: built.duration_minutes,
      duration_active: built.duration_active,
      duration_processing: built.duration_processing,
      need_processing: built.need_processing,
    });
  }

  const headerEndTime = computeLineEndTime(
    builtLines[0].start_time,
    totalDurationMinutesFromLines(builtLines),
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

    for (const built of builtLines) {
      const { error: lineErr } = await admin.from("appointment_services").insert({
        appointment_id: appointmentId,
        service_id: built.service_id,
        staff_id: built.staff_id,
        start_time: built.start_time,
        duration_minutes: built.duration_minutes,
        duration_active: built.duration_active,
        duration_processing: built.duration_processing,
        need_processing: built.need_processing,
        price: built.price,
        vat_rate: built.vat_rate,
      });

      if (lineErr) {
        if (isStaffSlotConflictFromDbError(lineErr)) {
          throw new CustomerAppBookingConflictError(STAFF_SLOT_CONFLICT_MESSAGE);
        }
        throw new Error(lineErr.message);
      }

      serviceDtos.push({
        service_id: built.service_id,
        staff_id: built.staff_id,
        start_time: built.start_time,
        end_time: built.end_time,
        duration: built.duration_minutes,
        price: built.price,
      });
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
      const { error: linesCleanupErr } = await admin
        .from("appointment_services")
        .delete()
        .eq("appointment_id", appointmentIdCreated);
      if (linesCleanupErr) {
        console.error(
          "createCustomerAppBooking cleanup lines:",
          linesCleanupErr.message,
        );
      }
      const { error: headerCleanupErr } = await admin
        .from("appointments")
        .delete()
        .eq("id", appointmentIdCreated);
      if (headerCleanupErr) {
        console.error(
          "createCustomerAppBooking cleanup header:",
          headerCleanupErr.message,
        );
      }
    }
    throw e;
  }
}
