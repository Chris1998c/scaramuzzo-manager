import { createServerSupabase } from "@/lib/supabaseServer";

const DEFAULT_MIN_QTY = 2;
const OPEN_CASH_WARN_HOURS = 8;

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Ore da apertura sessione cassa ancora aperta (null se nessuna). */
export async function getOpenCashSessionHours(salonId: number): Promise<number | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("opened_at, closed_at")
    .eq("salon_id", salonId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = data?.[0] as { opened_at?: string } | undefined;
  if (!row?.opened_at) return null;

  const openedMs = new Date(row.opened_at).getTime();
  if (!Number.isFinite(openedMs)) return null;
  return (Date.now() - openedMs) / 3_600_000;
}

export { OPEN_CASH_WARN_HOURS };

/** Prodotti sotto soglia magazzino salone. */
export async function getSalonLowStockCount(salonId: number): Promise<number> {
  const supabase = await createServerSupabase();

  const [{ data: stockRows, error: stockErr }, { data: productsMeta, error: prodErr }] =
    await Promise.all([
      supabase.from("product_stock").select("product_id, quantity").eq("salon_id", salonId),
      supabase.from("products").select("id, low_stock").eq("active", true),
    ]);

  if (stockErr) throw new Error(stockErr.message);
  if (prodErr) throw new Error(prodErr.message);

  const metaById = new Map<string, number>();
  for (const p of productsMeta ?? []) {
    metaById.set(String((p as { id?: unknown }).id), n((p as { low_stock?: unknown }).low_stock));
  }

  let count = 0;
  for (const s of stockRows ?? []) {
    const pid = String((s as { product_id?: unknown }).product_id ?? "");
    if (!pid) continue;
    const qty = n((s as { quantity?: unknown }).quantity);
    const minQty = Math.max(0, metaById.get(pid) ?? DEFAULT_MIN_QTY);
    if (qty < minQty) count += 1;
  }
  return count;
}
