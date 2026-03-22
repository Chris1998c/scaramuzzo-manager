// lib/salonsSettings.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type SalonSettingsRow = {
  id: number;
  name: string;
  created_at: string | null;
};

export async function fetchSalonsForSettings(
  supabase: SupabaseClient,
): Promise<SalonSettingsRow[]> {
  const { data: rows, error } = await supabase
    .from("salons")
    .select("id,name,created_at")
    .order("id", { ascending: true });

  if (error) throw new Error(`fetchSalonsForSettings: ${error.message}`);

  return (rows ?? []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    created_at: r.created_at != null ? String(r.created_at) : null,
  }));
}
