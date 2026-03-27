import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Active staff IDs visible for a salon:
 * - All staff linked via public.staff_salons for this salon
 * - Plus legacy staff with public.staff.salon_id = salonId and no staff_salons rows at all
 *
 * If staff_salons is unavailable (migration/RLS), falls back to staff.salon_id only.
 */
export async function fetchActiveStaffIdsForSalon(
  supabase: SupabaseClient,
  salonId: number,
): Promise<number[]> {
  if (!Number.isFinite(salonId) || salonId <= 0) return [];

  const { data: junctionForSalon, error: jErr } = await supabase
    .from("staff_salons")
    .select("staff_id")
    .eq("salon_id", salonId);

  if (jErr) {
    console.warn("staff_salons unavailable, fallback staff.salon_id only:", jErr.message);
    const { data: legacyOnly, error: lErr } = await supabase
      .from("staff")
      .select("id")
      .eq("salon_id", salonId)
      .eq("active", true);
    if (lErr) throw lErr;
    return (legacyOnly ?? [])
      .map((r) => Number((r as { id: unknown }).id))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  const fromJunction = new Set<number>();
  for (const row of junctionForSalon ?? []) {
    const id = Number((row as { staff_id: unknown }).staff_id);
    if (Number.isInteger(id) && id > 0) fromJunction.add(id);
  }

  const { data: allLinks, error: allErr } = await supabase.from("staff_salons").select("staff_id");
  if (allErr) {
    console.warn("staff_salons staff_id list failed, using junction ∪ legacy salon column:", allErr.message);
    const { data: legacyRows, error: lErr } = await supabase
      .from("staff")
      .select("id")
      .eq("salon_id", salonId)
      .eq("active", true);
    if (lErr) throw lErr;
    const ids = new Set(fromJunction);
    for (const r of legacyRows ?? []) {
      const id = Number((r as { id: unknown }).id);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
    return Array.from(ids);
  }

  const staffWithAnyLink = new Set<number>();
  for (const row of allLinks ?? []) {
    const id = Number((row as { staff_id: unknown }).staff_id);
    if (Number.isInteger(id) && id > 0) staffWithAnyLink.add(id);
  }

  const { data: legacyCandidates, error: lErr } = await supabase
    .from("staff")
    .select("id")
    .eq("salon_id", salonId)
    .eq("active", true);

  if (lErr) throw lErr;

  const ids = new Set<number>(fromJunction);
  for (const r of legacyCandidates ?? []) {
    const id = Number((r as { id: unknown }).id);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!staffWithAnyLink.has(id)) ids.add(id);
  }

  return Array.from(ids);
}

export async function fetchActiveStaffForSalon(
  supabase: SupabaseClient,
  salonId: number,
  selectColumns: string,
): Promise<Record<string, unknown>[]> {
  const ids = await fetchActiveStaffIdsForSalon(supabase, salonId);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("staff")
    .select(selectColumns)
    .in("id", ids)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as Record<string, unknown>[];
}
