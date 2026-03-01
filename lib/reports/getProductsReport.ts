// lib/reports/getProductsReport.ts
import { createServerSupabase } from "@/lib/supabaseServer";

export type ProductsReportFilters = {
  salonId: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
};

const DEFAULT_MIN_QTY = 2;

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getProductsReport(filters: ProductsReportFilters) {
  const supabase = await createServerSupabase();
  const { salonId, dateFrom, dateTo } = filters;

  // 1) Venduto prodotti nel periodo (report_rows filtrato product)
  const { data: rowsData, error: rowsErr } = await supabase.rpc("report_rows", {
    p_salon_id: salonId,
    p_from: dateFrom,
    p_to: dateTo,
    p_staff_id: null,
    p_payment_method: null,
    p_item_type: "product",
  });
  if (rowsErr) throw new Error(rowsErr.message);

  const rows = (rowsData ?? []) as any[];

  const soldMap = new Map<
    string,
    { product_id: string; product_name: string; qty: number; gross: number }
  >();

  let productsQty = 0;
  let productsGross = 0;

  for (const r of rows) {
    const pid = r?.product_id != null ? String(r.product_id) : null;
    if (!pid) continue;

    const name = String(r?.product_name ?? `Prodotto ${pid}`);
    const qty = n(r?.quantity ?? 1);
    const gross = n(r?.line_total_gross ?? 0);

    productsQty += qty;
    productsGross += gross;

    if (!soldMap.has(pid)) {
      soldMap.set(pid, { product_id: pid, product_name: name, qty: 0, gross: 0 });
    }
    const x = soldMap.get(pid)!;
    x.qty += qty;
    x.gross += gross;
  }

  // 2) Meta prodotti (serve per nome, costo, soglia riordino)
  const { data: productsMeta, error: prodErr } = await supabase
    .from("products")
    .select("id, name, cost, low_stock, price")
    .eq("active", true);

  if (prodErr) throw new Error(prodErr.message);

  const metaById = new Map<string, any>();
  for (const p of (productsMeta ?? []) as any[]) {
    metaById.set(String(p.id), p);
  }

  // 3) Top prodotti + margine base
  const topProducts = Array.from(soldMap.values())
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 20)
    .map((x) => {
      const meta = metaById.get(x.product_id);

      const name = meta?.name ? String(meta.name) : x.product_name;
      const unitCost = n(meta?.cost ?? 0);
      const baseMargin = x.gross - unitCost * x.qty;

      return {
        product_id: x.product_id,
        product_name: name,
        qty: x.qty,
        gross_total: x.gross,
        unit_cost: unitCost,     // costo unitario
        base_margin: baseMargin, // margine base stimato
      };
    });

  // 4) Stock per salone + low stock
  const { data: stockRows, error: stockErr } = await supabase
    .from("product_stock")
    .select("product_id, quantity")
    .eq("salon_id", salonId);

  if (stockErr) throw new Error(stockErr.message);

  const lowStock: Array<{
    product_id: string;
    product_name: string;
    qty_on_hand: number;
    min_qty: number;
    deficit: number;
  }> = [];

  for (const s of (stockRows ?? []) as any[]) {
    const pid = s?.product_id != null ? String(s.product_id) : null;
    if (!pid) continue;

    const meta = metaById.get(pid);
    const name = meta?.name ? String(meta.name) : `Prodotto ${pid}`;

    const qtyOnHand = n(s?.quantity ?? 0);
    const minQty = Math.max(0, n(meta?.low_stock ?? DEFAULT_MIN_QTY));

    if (qtyOnHand < minQty) {
      lowStock.push({
        product_id: pid,
        product_name: name,
        qty_on_hand: qtyOnHand,
        min_qty: minQty,
        deficit: Math.max(0, minQty - qtyOnHand),
      });
    }
  }

  lowStock.sort((a, b) => b.deficit - a.deficit);

  return {
    totals: {
      products_qty: productsQty,
      products_gross: productsGross,
      low_stock_count: lowStock.length,
    },
    topProducts,
    lowStock,
  };
}