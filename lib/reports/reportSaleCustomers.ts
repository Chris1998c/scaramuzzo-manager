import { createServerSupabase } from "@/lib/supabaseServer";
import {
  SALES_LEDGER_OPERATION_TYPE,
  SALES_LEDGER_STATUS,
} from "@/lib/reports/ledgerSalesFilter";

/** Mappa sale_id → customer_id per KPI clienti serviti per staff. */
export async function fetchCustomerIdsBySaleIds(
  saleIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!saleIds.length) return map;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("sales")
    .select("id, customer_id")
    .in("id", saleIds);

  if (error) throw new Error(error.message);

  for (const s of data ?? []) {
    const id = Number((s as { id?: unknown }).id);
    const cid = (s as { customer_id?: unknown }).customer_id;
    if (!Number.isFinite(id) || !cid) continue;
    map.set(id, String(cid));
  }

  return map;
}

export async function fetchCustomerIdsForRows(
  rows: Array<{ sale_id: number | string | null }>,
): Promise<Map<number, string>> {
  const saleIds = [
    ...new Set(
      rows
        .map((r) => Number(r.sale_id))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  return fetchCustomerIdsBySaleIds(saleIds);
}

export async function fetchSaleIdsInRange(
  salonId: number,
  dateFrom: string,
  dateTo: string,
): Promise<number[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("sales")
    .select("id")
    .eq("salon_id", salonId)
    .eq("status", SALES_LEDGER_STATUS)
    .eq("operation_type", SALES_LEDGER_OPERATION_TYPE)
    .gte("date", `${dateFrom}T00:00:00`)
    .lte("date", `${dateTo}T23:59:59.999`);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((s) => Number((s as { id?: unknown }).id))
    .filter((n) => Number.isFinite(n) && n > 0);
}
