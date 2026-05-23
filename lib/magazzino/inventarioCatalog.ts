import type { SupabaseClient } from "@supabase/supabase-js";
import { movimentiRange, totalPages } from "@/lib/magazzino/stockMoveResult";

export const INVENTARIO_PAGE_SIZE = 50;
export const INVENTARIO_SOTTOSORTA_THRESHOLD = 5;

export type InventarioProductRow = {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
};

export type InventarioCatalogFilters = {
  search: string;
  category: string;
  sottoscortaOnly: boolean;
  page: number;
  pageSize?: number;
};

export type InventarioCatalogPage = {
  rows: InventarioProductRow[];
  totalCount: number;
  sottoscortaCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function parseQuantity(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseInventarioRow(raw: unknown): InventarioProductRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const productId = Number(r.product_id);
  if (!Number.isFinite(productId) || productId <= 0) return null;
  return {
    product_id: productId,
    name: String(r.name ?? ""),
    category: r.category != null ? String(r.category) : null,
    barcode: r.barcode != null ? String(r.barcode) : null,
    quantity: parseQuantity(r.quantity),
  };
}

export function parseInventarioCatalogRpc(data: unknown): InventarioCatalogPage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const page = Number(d.page);
  const pageSize = Number(d.page_size);
  const totalCount = Number(d.total_count);
  const sottoscortaCount = Number(d.sottoscorta_count);
  const rowsRaw = Array.isArray(d.rows) ? d.rows : [];

  const ps = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : INVENTARIO_PAGE_SIZE;
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  const rows = rowsRaw
    .map(parseInventarioRow)
    .filter((r): r is InventarioProductRow => r != null);

  const total = Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : rows.length;

  return {
    rows,
    totalCount: total,
    sottoscortaCount: Number.isFinite(sottoscortaCount) ? sottoscortaCount : 0,
    page: p,
    pageSize: ps,
    pageCount: totalPages(total, ps),
  };
}

/** Catalogo inventario paginato (RPC list_inventario_catalog). */
export async function fetchInventarioCatalogPage(
  supabase: SupabaseClient,
  salonId: number,
  filters: InventarioCatalogFilters,
): Promise<InventarioCatalogPage> {
  const pageSize = filters.pageSize ?? INVENTARIO_PAGE_SIZE;
  const { data, error } = await supabase.rpc("list_inventario_catalog", {
    p_salon_id: salonId,
    p_search: filters.search.trim() || null,
    p_category: filters.category.trim() || null,
    p_sottoscorta_only: filters.sottoscortaOnly,
    p_page: filters.page,
    p_page_size: pageSize,
  });

  if (error) throw error;

  const parsed = parseInventarioCatalogRpc(data);
  if (!parsed) {
    throw new Error("Risposta inventario non valida");
  }
  return parsed;
}

/** Range PostgREST coerente con paginazione inventario (test helper). */
export function inventarioCatalogRange(page: number, pageSize = INVENTARIO_PAGE_SIZE) {
  return movimentiRange(page, pageSize);
}

/** Categorie distinte per filtro (query leggera). */
export async function fetchInventarioCategories(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("products")
    .select("category")
    .eq("active", true);

  if (error) throw error;

  const set = new Set<string>();
  for (const row of data ?? []) {
    const c = row.category != null ? String(row.category).trim() : "";
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "it"));
}
