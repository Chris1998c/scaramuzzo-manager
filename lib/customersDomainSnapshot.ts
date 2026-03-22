import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CustomersDomainSnapshot } from "@/lib/customersDomainTypes";

export type { CustomersDomainSnapshot } from "@/lib/customersDomainTypes";

async function countRows(
  supabase: SupabaseClient,
  table: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`customersDomainSnapshot: ${table}`, error.message);
    return null;
  }
  return typeof count === "number" ? count : null;
}

/**
 * Conteggi sintetici sul dominio clienti (stesso accesso RLS dell'utente corrente).
 * Non sostituisce il modulo operativo: serve solo a Impostazioni come audit di stato.
 */
export async function fetchCustomersDomainSnapshot(
  supabase: SupabaseClient,
): Promise<CustomersDomainSnapshot> {
  const [
    customers,
    customer_profile,
    customer_notes,
    customer_tech_notes,
    customer_technical_cards,
    technical_sheets,
    customer_service_cards,
  ] = await Promise.all([
    countRows(supabase, "customers"),
    countRows(supabase, "customer_profile"),
    countRows(supabase, "customer_notes"),
    countRows(supabase, "customer_tech_notes"),
    countRows(supabase, "customer_technical_cards"),
    countRows(supabase, "technical_sheets"),
    countRows(supabase, "customer_service_cards"),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    counts: {
      customers,
      customer_profile,
      customer_notes,
      customer_tech_notes,
      customer_technical_cards,
      technical_sheets,
      customer_service_cards,
    },
  };
}
