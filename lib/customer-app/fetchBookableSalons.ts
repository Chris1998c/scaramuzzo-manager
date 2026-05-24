import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { REAL_SALON_IDS } from "@/lib/constants";

export type CustomerAppSalonDto = {
  id: number;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
};

/**
 * Saloni prenotabili per app clienti (1–4, escluso Magazzino Centrale).
 * Usa client session: RLS salons SELECT per authenticated.
 */
export async function fetchBookableSalons(
  supabase: SupabaseClient,
): Promise<CustomerAppSalonDto[]> {
  const { data, error } = await supabase
    .from("salons")
    .select("id, name")
    .in("id", [...REAL_SALON_IDS])
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`fetchBookableSalons: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
  }));
}
