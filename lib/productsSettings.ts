// lib/productsSettings.ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Riga prodotto per modulo Impostazioni (anagrafica globale, prezzo da `products.price`). */
export type ProductSettingsRow = {
  id: number;
  name: string;
  barcode: string | null;
  price: number;
  /** Da colonna `cost` se presente; in futuro estendibile senza cambiare il tipo consumer. */
  cost: number | null;
  active: boolean;
  category: string | null;
};

function toNum(v: unknown, fallback: number | null): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchProductsForSettings(
  supabase: SupabaseClient,
): Promise<ProductSettingsRow[]> {
  const { data: rows, error } = await supabase
    .from("products")
    .select("id,name,barcode,price,cost,active,category")
    .order("name");

  if (error) throw new Error(`fetchProductsForSettings: ${error.message}`);

  return (rows ?? []).map((r: Record<string, unknown>) => {
    const id = Number(r.id);
    return {
      id: Number.isFinite(id) ? id : 0,
      name: String(r.name ?? ""),
      barcode: r.barcode != null ? String(r.barcode) : null,
      price: toNum(r.price, 0) ?? 0,
      cost: r.cost != null ? toNum(r.cost, null) : null,
      active: !!r.active,
      category: r.category != null ? String(r.category) : null,
    };
  });
}
