import type { SupabaseClient } from "@supabase/supabase-js";

export const INVENTARIO_CATALOG_LIMIT = 500;

export type InventarioProductRow = {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
};

function parseQuantity(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Catalogo prodotti attivi + giacenza per salone (0 se assente in product_stock). */
export async function fetchInventarioCatalog(
  supabase: SupabaseClient,
  salonId: number,
  search: string,
  category: string,
): Promise<InventarioProductRow[]> {
  let productsQuery = supabase
    .from("products")
    .select("id, name, category, barcode")
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(INVENTARIO_CATALOG_LIMIT);

  const term = search.trim();
  if (term) productsQuery = productsQuery.ilike("name", `%${term}%`);
  if (category.trim()) productsQuery = productsQuery.eq("category", category.trim());

  const stockQuery = supabase
    .from("product_stock")
    .select("product_id, quantity")
    .eq("salon_id", salonId);

  const [productsRes, stockRes] = await Promise.all([productsQuery, stockQuery]);

  if (productsRes.error) throw productsRes.error;
  if (stockRes.error) throw stockRes.error;

  const qtyByProductId = new Map<number, number>();
  for (const row of stockRes.data ?? []) {
    const id = Number(row.product_id);
    if (!Number.isFinite(id)) continue;
    qtyByProductId.set(id, parseQuantity(row.quantity));
  }

  return (productsRes.data ?? []).map((p) => {
    const productId = Number(p.id);
    return {
      product_id: productId,
      name: String(p.name ?? ""),
      category: p.category != null ? String(p.category) : null,
      barcode: p.barcode != null ? String(p.barcode) : null,
      quantity: qtyByProductId.get(productId) ?? 0,
    };
  });
}
