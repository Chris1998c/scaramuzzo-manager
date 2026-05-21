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

/**
 * Per salone: staff_id → giorni ISO 1–7 con turno attivo (is_active=true).
 * Se uno staff non è in mappa → nessuna riga per quel salone → prenotabile tutti i giorni (legacy).
 */
export async function fetchStaffScheduleForSalon(
  supabase: SupabaseClient,
  salonId: number,
): Promise<Map<string, Set<number>>> {
  const staffToDays = new Map<string, Set<number>>();
  if (!Number.isFinite(salonId) || salonId <= 0) return staffToDays;

  const { data, error } = await supabase
    .from("staff_schedule")
    .select("staff_id, day_of_week")
    .eq("salon_id", salonId)
    .eq("is_active", true);

  if (error) {
    console.warn("staff_schedule fetch:", error.message);
    return staffToDays;
  }

  for (const row of data ?? []) {
    const r = row as { staff_id?: unknown; day_of_week?: unknown };
    const dow = Number(r.day_of_week);
    const sid = r.staff_id != null && r.staff_id !== "" ? String(r.staff_id) : "";
    if (!Number.isInteger(dow) || dow < 1 || dow > 7 || !sid) continue;
    if (!staffToDays.has(sid)) staffToDays.set(sid, new Set());
    staffToDays.get(sid)!.add(dow);
  }

  return staffToDays;
}

/**
 * Regola per collaboratore: con righe staff_schedule per questo salone → solo nei giorni del set;
 * senza righe (assente dalla mappa) → sempre visibile in agenda per quel salone.
 */
export function isStaffVisibleOnAgendaDayForSalon(
  staffIdToDaysISO: Map<string, Set<number>>,
  staffId: string,
  dayOfWeekISO: number,
): boolean {
  if (!Number.isInteger(dayOfWeekISO) || dayOfWeekISO < 1 || dayOfWeekISO > 7) return true;
  const days = staffIdToDaysISO.get(staffId);
  if (!days || days.size === 0) return true;
  return days.has(dayOfWeekISO);
}

export function isoDateFromLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Collaboratore con turni configurati ma non attivo nel giorno ISO della data. */
export function isStaffOffScheduleForAgendaDay(
  staffIdToDaysISO: Map<string, Set<number>>,
  staffId: string | number | null | undefined,
  isoDate: string,
): boolean {
  if (staffId == null || staffId === "") return false;
  const dow = isoDayOfWeekFromISODateLocal(isoDate);
  if (!dow) return false;
  return !isStaffVisibleOnAgendaDayForSalon(staffIdToDaysISO, String(staffId), dow);
}

type StaffPickRow = { id: number | string | null };

/**
 * Lista staff per select modali agenda: stessa regola di AgendaGrid / API.
 * includeStaffIds: valori già assegnati restano selezionabili anche se fuori turno.
 */
export function filterStaffForAgendaDay<T extends StaffPickRow>(
  staffRows: T[],
  staffIdToDaysISO: Map<string, Set<number>>,
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
    return isStaffVisibleOnAgendaDayForSalon(staffIdToDaysISO, sid, dow);
  });
}