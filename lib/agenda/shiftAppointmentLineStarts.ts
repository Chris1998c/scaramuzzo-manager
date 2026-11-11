import { parseLocal, toNoZ } from "@/lib/agenda/agendaContract";

/**
 * Shift orario header → righe: applica delta esatto senza snap per riga.
 * Preserva gap contigui (20+30, 35+20); lo snap resta solo sull'orario header richiesto.
 */
export function shiftAppointmentLineStart(
  startTime: string,
  deltaMs: number,
): string {
  return toNoZ(new Date(parseLocal(startTime).getTime() + deltaMs));
}

export type AppointmentLineTiming = {
  id: number;
  start_time: string;
  duration_minutes: number;
  staff_id?: number | null;
};

export type ShiftedAppointmentLineTiming = AppointmentLineTiming & {
  start_time: string;
};

/** Applica lo stesso delta a tutte le righe (ordine invariato). */
export function shiftAppointmentLineTimings(
  lines: AppointmentLineTiming[],
  deltaMs: number,
): ShiftedAppointmentLineTiming[] {
  if (deltaMs === 0) {
    return lines.map((l) => ({ ...l }));
  }
  return lines.map((l) => ({
    ...l,
    start_time: shiftAppointmentLineStart(l.start_time, deltaMs),
  }));
}
