import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Turni settimanali per salone primario: giorni ISO 1–7 con is_active=true.
 * Nessuna riga = visibile tutti i giorni in agenda (legacy).
 */
export async function syncStaffScheduleForSalon(
  admin: SupabaseClient,
  staffId: number,
  salonId: number,
  activeDays: number[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: delErr } = await admin
    .from("staff_schedule")
    .delete()
    .eq("staff_id", staffId)
    .eq("salon_id", salonId);

  if (delErr) return { ok: false, error: delErr.message };

  const days = [...new Set(activeDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))];
  if (!days.length) return { ok: true };

  const { error: insErr } = await admin.from("staff_schedule").insert(
    days.map((day_of_week) => ({
      staff_id: staffId,
      salon_id: salonId,
      day_of_week,
      is_active: true,
    })),
  );

  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}
