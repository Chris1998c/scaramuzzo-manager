import type { SupabaseClient } from "@supabase/supabase-js";
import { searchCustomersForClienti, type ClientiListRow } from "@/lib/customers/clientiListQuery";
import { filterCustomersBySearch } from "@/lib/customers/customerSearch";
import {
  CUSTOMER_VISIBLE_MAX,
  preloadCustomerSearchPool,
} from "@/lib/customers/customerSearchCache";

export { preloadCustomerSearchPool } from "@/lib/customers/customerSearchCache";

export type CustomerPickerRow = ClientiListRow & { full_name: string };

export function mapToCustomerPickerRow(row: ClientiListRow): CustomerPickerRow {
  return {
    ...row,
    full_name:
      `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim() ||
      "Cliente",
  };
}

/** Ricerca server (searchCustomersForClienti + filtro locale invariato). */
export async function fetchServerCustomerSearch(
  supabase: SupabaseClient,
  rawQuery: string,
  searchLimit = CUSTOMER_VISIBLE_MAX + 4,
): Promise<{ rows: CustomerPickerRow[]; error: string | null }> {
  const q = String(rawQuery ?? "").trim();
  if (q.length < 2) return { rows: [], error: null };

  const { data, error } = await searchCustomersForClienti(supabase, q, searchLimit);
  const mapped = (data ?? []).map(mapToCustomerPickerRow);
  return {
    rows: filterCustomersBySearch(mapped, q).slice(0, CUSTOMER_VISIBLE_MAX),
    error,
  };
}
