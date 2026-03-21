// lib/reports/getSalonTurnover.ts

import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type TurnoverFilters = {
  salonId: number;
  dateFrom: string;
  dateTo: string;
  staffId?: number | null;
  paymentMethod?: string | null;
  itemType?: string | null;
};

// Shape normalizzata delle righe di report_rows usata da frontend e analytics
export type ReportRow = {
  sale_item_id: number | string | null;
  id: number | string | null;
  sale_id: number | string | null;
  sale_day: string | null;
  item_type: string | null;
  product_name: string | null;
  service_name: string | null;
  quantity: number;
  price: number;
  line_total_gross: number;
  line_net: number;
  line_vat: number;
  item_discount: number;
  staff_id: number | null;
  staff_name: string | null;
  payment_method: string | null;
  /** Stato fiscale vendita (solo UI lista: non usato nei totali) */
  fiscal_status?: string | null;
};

function normalizeRow(r: any): ReportRow {
  const sale_item_id =
    r?.sale_item_id ??
    r?.id ??
    r?.item_id ??
    null;

  const id =
    r?.id ??
    r?.sale_item_id ??
    r?.item_id ??
    null;

  const sale_id =
    r?.sale_id ??
    r?.receipt_id ??
    r?.ticket_id ??
    null;

  const sale_day =
    (r?.sale_day as string | null) ??
    (r?.day as string | null) ??
    (r?.date as string | null) ??
    null;

  const item_type =
    (r?.item_type as string | null) ??
    (r?.type as string | null) ??
    null;

  const product_name =
    (r?.product_name as string | null) ??
    (r?.name as string | null) ??
    null;

  const service_name =
    (r?.service_name as string | null) ??
    null;

  const quantityRaw =
    r?.quantity ??
    r?.qty ??
    1;
  const quantity = Number.isFinite(Number(quantityRaw))
    ? Number(quantityRaw)
    : 1;

  const priceRaw =
    r?.price ??
    r?.unit_price ??
    r?.line_price ??
    0;
  const price = Number.isFinite(Number(priceRaw))
    ? Number(priceRaw)
    : 0;

  const lineTotalRaw =
    r?.line_total_gross ??
    r?.total_gross ??
    r?.gross_total ??
    0;
  const line_total_gross = Number.isFinite(Number(lineTotalRaw))
    ? Number(lineTotalRaw)
    : 0;

  const lineNetRaw =
    r?.line_net ??
    r?.net_total ??
    0;
  const line_net = Number.isFinite(Number(lineNetRaw))
    ? Number(lineNetRaw)
    : 0;

  const lineVatRaw =
    r?.line_vat ??
    r?.vat_total ??
    0;
  const line_vat = Number.isFinite(Number(lineVatRaw))
    ? Number(lineVatRaw)
    : 0;

  const discountRaw =
    r?.item_discount ??
    r?.discount ??
    0;
  const item_discount = Number.isFinite(Number(discountRaw))
    ? Number(discountRaw)
    : 0;

  const staff_idRaw =
    r?.staff_id ??
    null;
  const staff_id = staff_idRaw != null
    ? Number(staff_idRaw)
    : null;

  const staff_name =
    (r?.staff_name as string | null) ??
    null;

  const payment_method =
    (r?.payment_method as string | null) ??
    null;

  return {
    sale_item_id,
    id,
    sale_id,
    sale_day,
    item_type,
    product_name,
    service_name,
    quantity,
    price,
    line_total_gross,
    line_net,
    line_vat,
    item_discount,
    staff_id,
    staff_name,
    payment_method,
  };
}

export async function getSalonTurnover(filters: TurnoverFilters) {
  const supabase = await createServerSupabase();

  const {
    salonId,
    dateFrom,
    dateTo,
    staffId = null,
    paymentMethod = null,
    itemType = null,
  } = filters;

  const { data: totalsData, error: totalsError } = await supabase.rpc(
    "report_turnover",
    {
      p_salon_id: salonId,
      p_from: dateFrom,
      p_to: dateTo,
      p_staff_id: staffId,
      p_payment_method: paymentMethod,
      p_item_type: itemType,
    }
  );

  if (totalsError) throw new Error(totalsError.message);

  const totals =
    Array.isArray(totalsData) && totalsData.length > 0
      ? totalsData[0]
      : {
          receipts_count: 0,
          gross_total: 0,
          net_total: 0,
          vat_total: 0,
          discount_total: 0,
          gross_services: 0,
          gross_products: 0,
        };

  const { data: rowsData, error: rowsError } = await supabase.rpc("report_rows", {
    p_salon_id: salonId,
    p_from: dateFrom,
    p_to: dateTo,
    p_staff_id: staffId,
    p_payment_method: paymentMethod,
    p_item_type: itemType,
  });

  if (rowsError) throw new Error(rowsError.message);

  const normalizedRows: ReportRow[] = Array.isArray(rowsData)
    ? rowsData.map((r) => normalizeRow(r))
    : [];

  const saleIds = [
    ...new Set(
      normalizedRows
        .map((r) => r.sale_id)
        .filter((x) => x != null && x !== "")
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];

  const fiscalBySaleId = new Map<number, string>();
  if (saleIds.length > 0) {
    const { data: salesFs } = await supabaseAdmin
      .from("sales")
      .select("id, fiscal_status")
      .in("id", saleIds);

    for (const s of salesFs ?? []) {
      const row = s as { id?: unknown; fiscal_status?: unknown };
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      fiscalBySaleId.set(
        id,
        String(row.fiscal_status ?? "pending").trim() || "pending",
      );
    }
  }

  const rowsWithFiscal: ReportRow[] = normalizedRows.map((r) => ({
    ...r,
    fiscal_status: fiscalBySaleId.get(Number(r.sale_id)) ?? "pending",
  }));

  return {
    totals,
    rows: rowsWithFiscal,
  };
}