import type { SupabaseClient } from "@supabase/supabase-js";

/** Unisce salone primario e junction; ordine crescente per stabilità JWT/API. */
export function mergeStaffSalonIds(primarySalonId: number, junctionSalonIds: number[]): number[] {
  const set = new Set<number>();
  if (Number.isInteger(primarySalonId) && primarySalonId > 0) {
    set.add(primarySalonId);
  }
  for (const id of junctionSalonIds) {
    if (Number.isInteger(id) && id > 0) {
      set.add(id);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Saloni autorizzati per mobile: staff.salon_id + public.staff_salons.
 */
export async function resolveStaffSalonIds(
  admin: SupabaseClient,
  staffId: number,
  primarySalonId: number | null | undefined,
): Promise<number[]> {
  const primary =
    primarySalonId != null && Number.isInteger(Number(primarySalonId)) && Number(primarySalonId) > 0
      ? Number(primarySalonId)
      : 0;

  const { data, error } = await admin
    .from("staff_salons")
    .select("salon_id")
    .eq("staff_id", staffId);

  if (error) {
    console.error("resolveStaffSalonIds staff_salons:", error.message);
  }

  const junction = (data ?? [])
    .map((row) => Number((row as { salon_id: unknown }).salon_id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!primary && junction.length === 0) {
    return [];
  }
  if (!primary && junction.length > 0) {
    return mergeStaffSalonIds(junction[0], junction);
  }
  return mergeStaffSalonIds(primary, junction);
}
