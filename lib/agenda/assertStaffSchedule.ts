import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchStaffScheduleForSalon,
  isoDayOfWeekFromISODateLocal,
  isStaffVisibleOnAgendaDayForSalon,
} from "@/lib/staffSchedule";

export const STAFF_SCHEDULE_CONFLICT_MESSAGE =
  "Collaboratore non disponibile in questo giorno";

/** Estrae YYYY-MM-DD da start_time agenda (locale, senza Z). */
export function isoDateFromAgendaStartTime(startTime: string): string | null {
  const m = String(startTime).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function isStaffScheduleConflictError(e: unknown): boolean {
  return e instanceof Error && e.message === STAFF_SCHEDULE_CONFLICT_MESSAGE;
}

export type AssertStaffScheduledInput = {
  supabase: SupabaseClient;
  salonId: number;
  staffId: number | null;
  startTime: string;
  /** Riutilizza la mappa per più righe nella stessa richiesta. */
  scheduleMap?: Map<string, Set<number>>;
};

/**
 * Enforcement turni settimanali (staff_schedule) per salone.
 *
 * Legacy (compatibile con AgendaGrid): se lo staff non ha alcuna riga
 * staff_schedule per quel salone, è prenotabile in tutti i giorni.
 * Con righe presenti, il giorno ISO (1=lun … 7=dom) deve essere nel set.
 *
 * @throws Error con STAFF_SCHEDULE_CONFLICT_MESSAGE se fuori turno
 */
export async function assertStaffScheduledForStartTime(
  input: AssertStaffScheduledInput,
): Promise<void> {
  const { supabase, salonId, staffId, startTime, scheduleMap } = input;
  if (staffId == null) return;

  const isoDate = isoDateFromAgendaStartTime(startTime);
  if (!isoDate) {
    throw new Error("Data/ora appuntamento non valida");
  }

  const dow = isoDayOfWeekFromISODateLocal(isoDate);
  const map = scheduleMap ?? (await fetchStaffScheduleForSalon(supabase, salonId));

  if (!isStaffVisibleOnAgendaDayForSalon(map, String(staffId), dow)) {
    throw new Error(STAFF_SCHEDULE_CONFLICT_MESSAGE);
  }
}
