import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Giorno ISO da una data locale YYYY-MM-DD: 1 = lunedì … 7 = domenica
 * (allineato a public.staff_schedule.day_of_week).
 */
export function isoDayOfWeekFromISODateLocal(isoDate: string): number {
  const parts = isoDate.split("-").map(Number);
  if (parts.length < 3 || !parts.every((n) => Number.isFinite(n))) return 0;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** Regola turno per un giorno ISO (1–7). */
export type StaffScheduleDayRule = {
  startTime: string | null;
  endTime: string | null;
};

/** staff_id → giorno ISO → regola. Assente dalla mappa = legacy tutti i giorni. */
export type StaffScheduleBySalon = Map<string, Map<number, StaffScheduleDayRule>>;

export type StaffScheduleDayInput = {
  day_of_week: number;
  start_time?: string | null;
  end_time?: string | null;
};

/** Normalizza time DB/API → HH:MM. */
export function normalizeScheduleTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Minuti da mezzanotte da HH:MM o HH:MM:SS. */
export function scheduleTimeToMinutes(value: string | null | undefined): number | null {
  const n = normalizeScheduleTime(value);
  if (!n) return null;
  const [h, m] = n.split(":").map(Number);
  return h * 60 + m;
}

/** Minuti da start_time agenda (YYYY-MM-DDTHH:MM:SS locale). */
export function minutesFromAgendaStartTime(startTime: string): number {
  const m = String(startTime).trim().match(/T(\d{2}):(\d{2})/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Finestra default salone per turni senza start/end (allineato a agenda Roma 10:00–20:30).
 * Altri saloni: 9:00–20:30 come griglia agenda.
 */
export function salonDefaultScheduleWindow(salonId: number): {
  startMinutes: number;
  endMinutes: number;
} {
  const startH = salonId === 1 ? 10 : salonId >= 2 && salonId <= 4 ? 9 : 8;
  return { startMinutes: startH * 60, endMinutes: 20 * 60 + 30 };
}

function resolveDayWindow(
  rule: StaffScheduleDayRule,
  salonId: number,
): { startMinutes: number; endMinutes: number } {
  const def = salonDefaultScheduleWindow(salonId);
  const start = scheduleTimeToMinutes(rule.startTime) ?? def.startMinutes;
  const end = scheduleTimeToMinutes(rule.endTime) ?? def.endMinutes;
  return { startMinutes: start, endMinutes: end };
}

/** Staff con almeno un giorno configurato per il salone. */
export function staffHasScheduleConfigured(
  map: StaffScheduleBySalon,
  staffId: string,
): boolean {
  const days = map.get(staffId);
  return !!days && days.size > 0;
}

/**
 * Per salone: staff_id → giorni con turno attivo (is_active=true) + orari opzionali.
 * Se uno staff non è in mappa → nessuna riga per quel salone → prenotabile tutti i giorni (legacy).
 */
export async function fetchStaffScheduleForSalon(
  supabase: SupabaseClient,
  salonId: number,
): Promise<StaffScheduleBySalon> {
  const staffToDays: StaffScheduleBySalon = new Map();
  if (!Number.isFinite(salonId) || salonId <= 0) return staffToDays;

  const { data, error } = await supabase
    .from("staff_schedule")
    .select("staff_id, day_of_week, start_time, end_time")
    .eq("salon_id", salonId)
    .eq("is_active", true);

  if (error) {
    console.warn("staff_schedule fetch:", error.message);
    return staffToDays;
  }

  for (const row of data ?? []) {
    const r = row as {
      staff_id?: unknown;
      day_of_week?: unknown;
      start_time?: unknown;
      end_time?: unknown;
    };
    const dow = Number(r.day_of_week);
    const sid = r.staff_id != null && r.staff_id !== "" ? String(r.staff_id) : "";
    if (!Number.isInteger(dow) || dow < 1 || dow > 7 || !sid) continue;
    if (!staffToDays.has(sid)) staffToDays.set(sid, new Map());
    staffToDays.get(sid)!.set(dow, {
      startTime: normalizeScheduleTime(r.start_time),
      endTime: normalizeScheduleTime(r.end_time),
    });
  }

  return staffToDays;
}

/** Vista giorni-only per filtri UI agenda (colonne / select). */
export function staffScheduleToDaySetMap(
  map: StaffScheduleBySalon,
): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const [sid, days] of map) {
    out.set(sid, new Set(days.keys()));
  }
  return out;
}

/**
 * Regola per collaboratore: con righe staff_schedule per questo salone → solo nei giorni del set;
 * senza righe (assente dalla mappa) → sempre visibile in agenda per quel salone.
 */
export function isStaffVisibleOnAgendaDayForSalon(
  staffIdToSchedule: StaffScheduleBySalon,
  staffId: string,
  dayOfWeekISO: number,
): boolean {
  if (!Number.isInteger(dayOfWeekISO) || dayOfWeekISO < 1 || dayOfWeekISO > 7) return true;
  if (!staffHasScheduleConfigured(staffIdToSchedule, staffId)) return true;
  return staffIdToSchedule.get(staffId)?.has(dayOfWeekISO) ?? false;
}

export type StaffScheduleWindowCheck =
  | { ok: true }
  | { ok: false; kind: "day" | "time" };

/**
 * Verifica giorno + fascia oraria (start + durata riga dentro start_time/end_time).
 * Legacy: nessuna riga → ok. Giorno attivo con orari NULL → default salone.
 */
export function checkStaffAppointmentScheduleWindow(input: {
  scheduleMap: StaffScheduleBySalon;
  staffId: number | string;
  salonId: number;
  startTime: string;
  durationMinutes: number;
}): StaffScheduleWindowCheck {
  const sid = String(input.staffId);
  const map = input.scheduleMap;
  if (!staffHasScheduleConfigured(map, sid)) return { ok: true };

  const isoDate = String(input.startTime).trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!isoDate) return { ok: true };

  const dow = isoDayOfWeekFromISODateLocal(isoDate);
  const days = map.get(sid);
  const rule = days?.get(dow);
  if (!rule) return { ok: false, kind: "day" };

  const duration = Number(input.durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return { ok: true };

  const { startMinutes, endMinutes } = resolveDayWindow(rule, input.salonId);
  const apptStart = minutesFromAgendaStartTime(input.startTime);
  const apptEnd = apptStart + duration;

  if (apptStart < startMinutes || apptEnd > endMinutes) {
    return { ok: false, kind: "time" };
  }

  return { ok: true };
}

export function isoDateFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Collaboratore con turni configurati ma non attivo nel giorno ISO della data. */
export function isStaffOffScheduleForAgendaDay(
  staffIdToSchedule: StaffScheduleBySalon,
  staffId: string | number | null | undefined,
  isoDate: string,
): boolean {
  if (staffId == null || staffId === "") return false;
  const dow = isoDayOfWeekFromISODateLocal(isoDate);
  if (!dow) return false;
  return !isStaffVisibleOnAgendaDayForSalon(staffIdToSchedule, String(staffId), dow);
}

type StaffPickRow = { id: number | string | null };

/**
 * Lista staff per select modali agenda: stessa regola di AgendaGrid / API.
 * includeStaffIds: valori già assegnati restano selezionabili anche se fuori turno.
 */
export function filterStaffForAgendaDay<T extends StaffPickRow>(
  staffRows: T[],
  staffIdToSchedule: StaffScheduleBySalon,
  isoDate: string,
  includeStaffIds?: Iterable<string | number | null | undefined>,
): T[] {
  const dow = isoDayOfWeekFromISODateLocal(isoDate);
  const include = new Set(
    [...(includeStaffIds ?? [])]
      .filter((id) => id != null && id !== "")
      .map((id) => String(id)),
  );

  if (!dow) return staffRows;

  return staffRows.filter((row) => {
    const id = row.id;
    if (id == null || id === "") return true;
    const sid = String(id);
    if (include.has(sid)) return true;
    return isStaffVisibleOnAgendaDayForSalon(staffIdToSchedule, sid, dow);
  });
}
