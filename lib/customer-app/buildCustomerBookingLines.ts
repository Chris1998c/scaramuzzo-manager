import {
  parseLocal,
  snapToAgendaSlot,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import {
  assertBatchInternalStaffSlotsFree,
  computeLineEndTime,
  type BatchStaffSlotLine,
} from "@/lib/agenda/assertStaffSlotFree";

export type CustomerBookingLineInput = {
  service_id: number;
  staff_id: number;
  duration_minutes: number;
  price: number;
  vat_rate: number;
};

export type BuiltCustomerBookingLine = CustomerBookingLineInput & {
  start_time: string;
  end_time: string;
};

/**
 * Costruisce righe appointment_services contigue per booking App Clienti.
 *
 * - Prima riga: inizio snappato alla griglia agenda (15 min).
 * - Righe successive: partono alla fine reale della riga precedente (nessun snap indietro).
 *
 * Allineato al probe availability (blocco [start, start + somma durate]).
 */
export function buildCustomerBookingLines(
  requestedStartTime: string,
  lines: CustomerBookingLineInput[],
): BuiltCustomerBookingLine[] {
  if (!lines.length) {
    return [];
  }

  const built: BuiltCustomerBookingLine[] = [];
  let cursorMs = parseLocal(requestedStartTime).getTime();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineStart =
      index === 0
        ? toNoZ(snapToAgendaSlot(parseLocal(requestedStartTime)))
        : toNoZ(new Date(cursorMs));
    const lineEnd = computeLineEndTime(lineStart, line.duration_minutes);

    built.push({
      ...line,
      start_time: lineStart,
      end_time: lineEnd,
    });

    cursorMs = parseLocal(lineStart).getTime() + line.duration_minutes * 60_000;
  }

  return built;
}

export function customerBookingLinesToBatchStaffSlots(
  lines: BuiltCustomerBookingLine[],
): BatchStaffSlotLine[] {
  return lines.map((line) => ({
    staffId: line.staff_id,
    startTime: line.start_time,
    durationMinutes: line.duration_minutes,
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
