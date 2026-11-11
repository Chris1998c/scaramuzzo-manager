import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  absoluteIntervalsOverlapAny,
  appointmentServiceBusyAbsoluteIntervals,
  parseLocal,
  toNoZ,
  type AgendaAbsoluteMsInterval,
} from "@/lib/agenda/agendaContract";

export const STAFF_SLOT_CONFLICT_MESSAGE =
  "Collaboratore già impegnato in questa fascia oraria";

/** Appuntamenti che non occupano agenda (nessun overlap). */
const TERMINAL_APPOINTMENT_STATUSES = new Set([
  "cancelled",
  "no_show",
  "noshow",
  "done",
]);

export type StaffOccupancySnapshot = {
  duration_active?: number | null;
  duration_processing?: number | null;
  need_processing?: boolean | null;
};

export type AssertStaffSlotFreeInput = {
  supabase: SupabaseClient;
  salonId: number;
  staffId: number;
  startTime: string;
  endTime: string;
  /** Durata display della riga proposta; con snapshot → busy a segmenti. */
  durationMinutes?: number;
  duration_active?: number | null;
  duration_processing?: number | null;
  need_processing?: boolean | null;
  excludeAppointmentId?: number | null;
  excludeLineId?: number | null;
};

/**
 * Fine logica riga = start + duration (senza snap).
 * Lo snap arrotondato rompeva multi-servizio non multiplo di 15 (es. 20′ → end prima del start successivo).
 */
export function computeLineEndTime(startTime: string, durationMinutes: number): string {
  const startMs = parseLocal(startTime).getTime();
  return toNoZ(new Date(startMs + durationMinutes * 60_000));
}

/** [startA, endA) vs [startB, endB) */
export function staffSlotIntervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function isTerminalAppointmentStatus(status: string): boolean {
  return TERMINAL_APPOINTMENT_STATUSES.has(status.trim().toLowerCase());
}

function messageFromUnknown(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown };
    return [o.message, o.details, o.hint].filter(Boolean).map(String).join(" ");
  }
  return "";
}

export function isStaffSlotConflictError(e: unknown): boolean {
  return e instanceof Error && e.message === STAFF_SLOT_CONFLICT_MESSAGE;
}

/** Errore da trigger/Raise Postgres (PostgREST o Error con messaggio nel testo). */
export function isStaffSlotConflictFromDbError(e: unknown): boolean {
  if (isStaffSlotConflictError(e)) return true;
  return messageFromUnknown(e).includes(STAFF_SLOT_CONFLICT_MESSAGE);
}

export function isStaffSlotConflictOrDbError(e: unknown): boolean {
  return isStaffSlotConflictError(e) || isStaffSlotConflictFromDbError(e);
}

export type BatchStaffSlotLine = {
  staffId: number | null;
  startTime: string;
  durationMinutes: number;
  duration_active?: number | null;
  duration_processing?: number | null;
  need_processing?: boolean | null;
};

function busySegmentsForLine(line: {
  startTime: string;
  durationMinutes: number;
  duration_active?: number | null;
  duration_processing?: number | null;
  need_processing?: boolean | null;
}): AgendaAbsoluteMsInterval[] {
  return appointmentServiceBusyAbsoluteIntervals({
    startTime: line.startTime,
    duration_minutes: line.durationMinutes,
    duration_active: line.duration_active,
    duration_processing: line.duration_processing,
    need_processing: line.need_processing,
  });
}

/**
 * Overlap tra righe dello stesso payload (stesso staff) prima dell'insert batch.
 * Confronta segmenti busy (posa libera non confligge).
 * @throws Error con STAFF_SLOT_CONFLICT_MESSAGE
 */
export function assertBatchInternalStaffSlotsFree(lines: BatchStaffSlotLine[]): void {
  const expanded: Array<{ staffId: number; busy: AgendaAbsoluteMsInterval[] }> = [];

  for (const line of lines) {
    if (line.staffId == null || line.durationMinutes <= 0) continue;
    const busy = busySegmentsForLine(line);
    if (!busy.length) continue;
    expanded.push({ staffId: line.staffId, busy });
  }

  for (let i = 0; i < expanded.length; i++) {
    for (let j = i + 1; j < expanded.length; j++) {
      if (expanded[i]!.staffId !== expanded[j]!.staffId) continue;
      if (absoluteIntervalsOverlapAny(expanded[i]!.busy, expanded[j]!.busy)) {
        throw new Error(STAFF_SLOT_CONFLICT_MESSAGE);
      }
    }
  }
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

function proposedBusySegments(input: AssertStaffSlotFreeInput): AgendaAbsoluteMsInterval[] {
  const newStartMs = parseLocal(input.startTime).getTime();
  const newEndMs = parseLocal(input.endTime).getTime();

  if (
    input.durationMinutes != null &&
    Number.isFinite(input.durationMinutes) &&
    input.durationMinutes > 0
  ) {
    return appointmentServiceBusyAbsoluteIntervals({
      startTime: input.startTime,
      duration_minutes: input.durationMinutes,
      duration_active: input.duration_active,
      duration_processing: input.duration_processing,
      need_processing: input.need_processing,
    });
  }

  if (!Number.isFinite(newStartMs) || !Number.isFinite(newEndMs) || newEndMs <= newStartMs) {
    return [];
  }
  return [{ startMs: newStartMs, endMs: newEndMs }];
}

/**
 * Verifica su DB che lo staff non abbia segmenti busy sovrapposti nello stesso salone.
 * Righe senza snapshot → full duration_minutes; con posa valida → buco libero.
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

  const proposedBusy = proposedBusySegments(input);
  if (!proposedBusy.length) {
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
      duration_active,
      duration_processing,
      need_processing,
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

    const existingBusy = appointmentServiceBusyAbsoluteIntervals({
      startTime: existingStart,
      duration_minutes: duration,
      duration_active: (row as { duration_active?: unknown }).duration_active,
      duration_processing: (row as { duration_processing?: unknown }).duration_processing,
      need_processing: (row as { need_processing?: unknown }).need_processing,
    });

    if (absoluteIntervalsOverlapAny(proposedBusy, existingBusy)) {
      throw new Error(STAFF_SLOT_CONFLICT_MESSAGE);
    }
  }
}
