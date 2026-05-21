import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffScheduleDayInput } from "@/lib/staffSchedule";
import { normalizeScheduleTime } from "@/lib/staffSchedule";

/**
 * Sincronizza public.staff_salons con l'elenco desiderato.
 * Il salone primario (staff.salon_id) è sempre incluso.
 */
export async function syncStaffSalons(
  admin: SupabaseClient,
  staffId: number,
  primarySalonId: number,
  associatedSalonIds: number[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const desired = new Set<number>([primarySalonId]);
  for (const id of associatedSalonIds) {
    if (Number.isInteger(id) && id > 0) desired.add(id);
  }

  const { data: existing, error: readErr } = await admin
    .from("staff_salons")
    .select("id, salon_id")
    .eq("staff_id", staffId);

  if (readErr) {
    return { ok: false, error: readErr.message };
  }

  const existingSalonIds = new Set(
    (existing ?? []).map((r) => Number((r as { salon_id: unknown }).salon_id)),
  );

  const toRemove = (existing ?? []).filter(
    (r) => !desired.has(Number((r as { salon_id: unknown }).salon_id)),
  );

  if (toRemove.length) {
    const ids = toRemove.map((r) => Number((r as { id: unknown }).id));
    const { error: delErr } = await admin.from("staff_salons").delete().in("id", ids);
    if (delErr) return { ok: false, error: delErr.message };
  }

  const toAdd = [...desired].filter((sid) => !existingSalonIds.has(sid));
  if (toAdd.length) {
    const { error: insErr } = await admin.from("staff_salons").insert(
      toAdd.map((salon_id) => ({ staff_id: staffId, salon_id })),
    );
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

function normalizeScheduleDays(days: StaffScheduleDayInput[]): StaffScheduleDayInput[] {
  const out: StaffScheduleDayInput[] = [];
  const seen = new Set<number>();
  for (const row of days) {
    const dow = Math.floor(Number(row.day_of_week));
    if (!Number.isInteger(dow) || dow < 1 || dow > 7 || seen.has(dow)) continue;
    seen.add(dow);
    const start = normalizeScheduleTime(row.start_time);
    const end = normalizeScheduleTime(row.end_time);
    if (start && end) {
      const s = start.split(":").map(Number);
      const e = end.split(":").map(Number);
      const sm = s[0] * 60 + s[1];
      const em = e[0] * 60 + e[1];
      if (em <= sm) continue;
    }
    out.push({
      day_of_week: dow,
      start_time: start,
      end_time: end,
    });
  }
  return out.sort((a, b) => a.day_of_week - b.day_of_week);
}

/**
 * Turni settimanali per salone scelto: giorni ISO 1–7 con is_active=true.
 * start_time/end_time NULL = default griglia salone per quel giorno.
 * Nessuna riga = visibile tutti i giorni in agenda (legacy).
 */
export async function syncStaffScheduleForSalon(
  admin: SupabaseClient,
  staffId: number,
  salonId: number,
  days: StaffScheduleDayInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: delErr } = await admin
    .from("staff_schedule")
    .delete()
    .eq("staff_id", staffId)
    .eq("salon_id", salonId);

  if (delErr) return { ok: false, error: delErr.message };

  const normalized = normalizeScheduleDays(days);
  if (!normalized.length) return { ok: true };

  const { error: insErr } = await admin.from("staff_schedule").insert(
    normalized.map((d) => ({
      staff_id: staffId,
      salon_id: salonId,
      day_of_week: d.day_of_week,
      is_active: true,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
  );

  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}
