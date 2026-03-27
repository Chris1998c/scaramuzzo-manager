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
 * Per salone: staff_id → giorni ISO 1–7 in cui ha righe in staff_schedule.
 * Se uno staff non è in mappa → nessuna riga per quel salone → visibile tutti i giorni (comportamento legacy).
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
    .eq("salon_id", salonId);

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