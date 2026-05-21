import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOperationalCalendarSnapshot,
  resolveStaffAvailabilityForDate,
  type OperationalCalendarSnapshot,
} from "@/lib/salonOperationalCalendar";
import {
  fetchStaffScheduleForSalon,
  type StaffScheduleBySalon,
} from "@/lib/staffSchedule";

export const STAFF_SCHEDULE_CONFLICT_MESSAGE =
  "Collaboratore non disponibile in questo giorno";

export const STAFF_SCHEDULE_TIME_CONFLICT_MESSAGE =
  "Collaboratore non disponibile in questa fascia oraria";

export const SALON_CLOSED_DATE_MESSAGE = "Salone chiuso in questa data";

export const STAFF_UNAVAILABLE_DATE_MESSAGE =
  "Collaboratore non disponibile in questa data";

/** Estrae YYYY-MM-DD da start_time agenda (locale, senza Z). */
export function isoDateFromAgendaStartTime(startTime: string): string | null {
  const m = String(startTime).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function isStaffScheduleConflictError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message === STAFF_SCHEDULE_CONFLICT_MESSAGE ||
      e.message === STAFF_SCHEDULE_TIME_CONFLICT_MESSAGE ||
      e.message === SALON_CLOSED_DATE_MESSAGE ||
      e.message === STAFF_UNAVAILABLE_DATE_MESSAGE)
  );
}

function messageForAvailabilityCode(
  code: "salon_closed" | "staff_unavailable" | "override_time" | "schedule_day" | "schedule_time",
): string {
  switch (code) {
    case "salon_closed":
      return SALON_CLOSED_DATE_MESSAGE;
    case "staff_unavailable":
      return STAFF_UNAVAILABLE_DATE_MESSAGE;
    case "override_time":
    case "schedule_time":
      return STAFF_SCHEDULE_TIME_CONFLICT_MESSAGE;
    case "schedule_day":
    default:
      return STAFF_SCHEDULE_CONFLICT_MESSAGE;
  }
}

export type AssertStaffScheduledInput = {
  supabase: SupabaseClient;
  salonId: number;
  staffId: number | null;
  startTime: string;
  durationMinutes: number;
  /** Riutilizza la mappa per più righe nella stessa richiesta. */
  scheduleMap?: StaffScheduleBySalon;
  /**
   * Cache eccezioni calendario operativo (stessa data/salone).
   * Se assente, viene caricata una volta per isoDate della riga.
   */
  operationalSnapshot?: OperationalCalendarSnapshot;
  operationalIsoDate?: string;
};

/**
 * Enforcement turni + calendario operativo (eccezioni salone/staff per data).
 *
 * Precedenza:
 * 1. salon_operational_days closed → blocco salone
 * 2. staff_schedule_date_overrides unavailable → blocco staff
 * 3. override available → ok fuori turno settimanale (fascia override / open_extra / default salone)
 * 4. staff_schedule settimanale
 * 5. Legacy: zero righe staff_schedule → tutti i giorni/fasce
 *
 * @throws Error con messaggio operativo se fuori regole
 */
export async function assertStaffScheduledForStartTime(
  input: AssertStaffScheduledInput,
): Promise<void> {
  const {
    supabase,
    salonId,
    staffId,
    startTime,
    durationMinutes,
    scheduleMap,
    operationalSnapshot,
    operationalIsoDate,
  } = input;
  if (staffId == null) return;

  const isoDate = isoDateFromAgendaStartTime(startTime);
  if (!isoDate) {
    throw new Error("Data/ora appuntamento non valida");
  }

  const map = scheduleMap ?? (await fetchStaffScheduleForSalon(supabase, salonId));

  let snapshot = operationalSnapshot;
  if (!snapshot || operationalIsoDate !== isoDate) {
    snapshot = await fetchOperationalCalendarSnapshot(supabase, salonId, isoDate, [
      staffId,
    ]);
  }

  const resolution = resolveStaffAvailabilityForDate({
    salonId,
    isoDate,
    staffId,
    startTime,
    durationMinutes,
    salonDay: snapshot.salonDay,
    staffOverride: snapshot.staffOverrides.get(String(staffId)) ?? null,
    scheduleMap: map,
  });

  if (!resolution.ok) {
    throw new Error(messageForAvailabilityCode(resolution.code));
  }
}
