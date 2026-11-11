import { buildContiguousAgendaLines } from "@/lib/agenda/buildContiguousAgendaLines";
import {
  assertBatchInternalStaffSlotsFree,
  type BatchStaffSlotLine,
} from "@/lib/agenda/assertStaffSlotFree";

export type CustomerBookingLineInput = {
  service_id: number;
  staff_id: number;
  duration_minutes: number;
  duration_active: number;
  duration_processing: number;
  need_processing: boolean;
  price: number;
  vat_rate: number;
};

export type BuiltCustomerBookingLine = CustomerBookingLineInput & {
  start_time: string;
  end_time: string;
};

/**
 * Costruisce righe appointment_services contigue per booking App Clienti.
 * Delega a buildContiguousAgendaLines (stesso contratto create agenda/walk-in).
 */
export function buildCustomerBookingLines(
  requestedStartTime: string,
  lines: CustomerBookingLineInput[],
): BuiltCustomerBookingLine[] {
  return buildContiguousAgendaLines(requestedStartTime, lines);
}

export function customerBookingLinesToBatchStaffSlots(
  lines: BuiltCustomerBookingLine[],
): BatchStaffSlotLine[] {
  return lines.map((line) => ({
    staffId: line.staff_id,
    startTime: line.start_time,
    durationMinutes: line.duration_minutes,
    duration_active: line.duration_active,
    duration_processing: line.duration_processing,
    need_processing: line.need_processing,
  }));
}

/** Verifica overlap interno tra righe dello stesso payload (stesso contratto del booking). */
export function assertCustomerBookingLinesInternallyFree(
  lines: BuiltCustomerBookingLine[],
): void {
  assertBatchInternalStaffSlotsFree(customerBookingLinesToBatchStaffSlots(lines));
}

export function totalDurationMinutesFromLines(
  lines: Array<{ duration_minutes: number }>,
): number {
  return lines.reduce((sum, line) => sum + line.duration_minutes, 0);
}
