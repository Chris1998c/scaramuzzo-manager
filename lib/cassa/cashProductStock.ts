import type { SupabaseClient } from "@supabase/supabase-js";

/** Soglia UI scorta bassa (solo indicatore, server resta source of truth). */
export const CASH_LOW_STOCK_THRESHOLD = 2;

export type CashCatalogProduct = {
  id: number;
  name: string;
  price: number;
  active: boolean;
  stockQty: number;
};

export type CashStockStatus = "out" | "low" | "ok";

export function cashProductStockStatus(qty: number): CashStockStatus {
  if (qty <= 0) return "out";
  if (qty <= CASH_LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

export function cashProductStockLabel(status: CashStockStatus): string {
  if (status === "out") return "Esaurito";
  if (status === "low") return "Scorta bassa";
  return "Disponibile";
}

/** Prodotto selezionabile in cassa: attivo e giacenza salone > 0. */
export function canAddCashProduct(p: CashCatalogProduct): boolean {
  return p.active !== false && p.stockQty > 0;
}

export async function fetchCashProductsForSalon(
  supabase: SupabaseClient,
  salonId: number,
): Promise<CashCatalogProduct[]> {
  const [productsRes, stockRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, price, active")
      .eq("active", true)
      .order("name"),
    supabase
      .from("product_stock")
      .select("product_id, quantity")
      .eq("salon_id", salonId),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (stockRes.error) throw stockRes.error;

  const stockById = new Map<number, number>();
  for (const row of stockRes.data ?? []) {
    const pid = Number((row as { product_id?: unknown }).product_id);
    const q = Number((row as { quantity?: unknown }).quantity);
    if (Number.isFinite(pid) && pid > 0) {
      stockById.set(pid, Math.max(0, Number.isFinite(q) ? q : 0));
    }
  }

  return (productsRes.data ?? []).map((row) => {
    const id = Number(row.id);
    return {
      id,
      name: String(row.name ?? "Prodotto"),
      price: Number(row.price) || 0,
      active: row.active !== false,
      stockQty: stockById.get(id) ?? 0,
    };
  });
}

export function validateCartProductStock(
  items: Array<{ kind: "service" | "product"; id: number; qty: number; name: string }>,
  catalog: CashCatalogProduct[],
): { ok: true } | { ok: false; message: string } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const required = new Map<number, number>();

  for (const it of items) {
    if (it.kind !== "product") continue;
    required.set(it.id, (required.get(it.id) ?? 0) + it.qty);
  }

  for (const [id, qty] of required) {
    const p = byId.get(id);
    const stock = p?.stockQty ?? 0;
    if (qty > stock) {
      const name = p?.name ?? "Prodotto";
      return {
        ok: false,
        message:
          stock <= 0
            ? `Prodotto esaurito: ${name}`
            : `Giacenza insufficiente: ${name} (disponibili ${stock}, richiesti ${qty})`,
      };
    }
  }

  return { ok: true };
}
