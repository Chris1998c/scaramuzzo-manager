import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkStaffAppointmentScheduleWindow,
  fetchStaffScheduleForSalon,
  type StaffScheduleBySalon,
} from "@/lib/staffSchedule";

export const STAFF_SCHEDULE_CONFLICT_MESSAGE =
  "Collaboratore non disponibile in questo giorno";

export const STAFF_SCHEDULE_TIME_CONFLICT_MESSAGE =
  "Collaboratore non disponibile in questa fascia oraria";

/** Estrae YYYY-MM-DD da start_time agenda (locale, senza Z). */
export function isoDateFromAgendaStartTime(startTime: string): string | null {
  const m = String(startTime).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function isStaffScheduleConflictError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message === STAFF_SCHEDULE_CONFLICT_MESSAGE ||
      e.message === STAFF_SCHEDULE_TIME_CONFLICT_MESSAGE)
  );
}

export type AssertStaffScheduledInput = {
  supabase: SupabaseClient;
  salonId: number;
  staffId: number | null;
  startTime: string;
  durationMinutes: number;
  /** Riutilizza la mappa per più righe nella stessa richiesta. */
  scheduleMap?: StaffScheduleBySalon;
};

/**
 * Enforcement turni settimanali (staff_schedule) per salone: giorno + fascia oraria.
 *
 * Legacy: se lo staff non ha alcuna riga staff_schedule per quel salone, è prenotabile
 * in tutti i giorni e fasce. Con righe presenti, il giorno ISO deve esistere e
 * [start, start+duration) deve stare in start_time/end_time (NULL = default salone).
 *
 * @throws Error con messaggio giorno o fascia se fuori turno
 */
export async function assertStaffScheduledForStartTime(
  input: AssertStaffScheduledInput,
): Promise<void> {
  const { supabase, salonId, staffId, startTime, durationMinutes, scheduleMap } = input;
  if (staffId == null) return;

  const isoDate = isoDateFromAgendaStartTime(startTime);
  if (!isoDate) {
    throw new Error("Data/ora appuntamento non valida");
  }

  const map = scheduleMap ?? (await fetchStaffScheduleForSalon(supabase, salonId));

  const check = checkStaffAppointmentScheduleWindow({
    scheduleMap: map,
    staffId,
    salonId,
    startTime,
    durationMinutes,
  });

  if (!check.ok) {
    throw new Error(
      check.kind === "time"
        ? STAFF_SCHEDULE_TIME_CONFLICT_MESSAGE
        : STAFF_SCHEDULE_CONFLICT_MESSAGE,
    );
  }
}
