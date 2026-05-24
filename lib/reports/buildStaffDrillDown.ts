import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import type { ReportRow } from "@/lib/reports/getSalonTurnover";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";

export type StaffDrillDownItem = {
  name: string;
  quantity: number;
  gross: number;
};

export type StaffDrillDownCustomerRef = {
  customer_id: string;
  customer_name?: string;
};

export type StaffDrillDownCustomer = StaffDrillDownCustomerRef & {
  last_day: string;
  gross: number;
  visits: number;
};

export type StaffDrillDownDay = {
  day: string;
  gross: number;
  receipts: number;
};

export type StaffDrillDownData = {
  topServices: StaffDrillDownItem[];
  topProducts: StaffDrillDownItem[];
  recentCustomers: StaffDrillDownCustomer[];
  customersWithoutRetail: StaffDrillDownCustomerRef[];
  discountedReceipts: number;
  totalReceipts: number;
  dailyTrend: StaffDrillDownDay[];
  periodComparison: {
    previous_incassato: number;
    current_incassato: number;
    delta_pct: number | null;
  } | null;
  retailSold: number;
  servicesQty: number;
  productsQty: number;
  receiptsWithoutCustomer: number;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function aggregateItems(
  staffRows: ReportRow[],
  itemType: "service" | "product",
): StaffDrillDownItem[] {
  const map = new Map<string, StaffDrillDownItem>();

  for (const r of staffRows) {
    if (r.item_type !== itemType) continue;
    const name =
      itemType === "product"
        ? String(r.product_name ?? "Prodotto").trim() || "Prodotto"
        : String(r.service_name ?? "Servizio").trim() || "Servizio";

    const prev = map.get(name) ?? { name, quantity: 0, gross: 0 };
    prev.quantity += n(r.quantity) || 1;
    prev.gross += n(r.line_total_gross);
    map.set(name, prev);
  }

  return [...map.values()].sort((a, b) => b.gross - a.gross).slice(0, 5);
}

export function buildStaffDrillDown(input: {
  staffId: number;
  rows: ReportRow[];
  customerBySaleId: Record<string, string>;
  current: StaffKpiRow;
  previous?: StaffKpiRow | null;
  vatMode?: VatDisplayMode;
}): StaffDrillDownData {
  const mode = input.vatMode ?? "gross";
  const staffRows = input.rows.filter((r) => Number(r.staff_id) === input.staffId);
  const saleCustomer = input.customerBySaleId;

  const customersAll = new Set<string>();
  const customersWithProduct = new Set<string>();
  const customerAgg = new Map<string, { last_day: string; gross: number; visits: Set<number> }>();

  const dailyMap = new Map<string, { gross: number; receipts: Set<number> }>();

  for (const r of staffRows) {
    const saleId = Number(r.sale_id);
    const day = String(r.sale_day ?? "").slice(0, 10);
    const gross = n(r.line_total_gross);

    if (day) {
      const d = dailyMap.get(day) ?? { gross: 0, receipts: new Set<number>() };
      d.gross += gross;
      if (Number.isFinite(saleId) && saleId > 0) d.receipts.add(saleId);
      dailyMap.set(day, d);
    }

    if (!Number.isFinite(saleId) || saleId <= 0) continue;

    const cid = saleCustomer[String(saleId)];
    if (!cid) continue;

    customersAll.add(cid);

    const agg = customerAgg.get(cid) ?? { last_day: "", gross: 0, visits: new Set<number>() };
    agg.gross += gross;
    agg.visits.add(saleId);
    if (day && (!agg.last_day || day > agg.last_day)) agg.last_day = day;
    customerAgg.set(cid, agg);

    if (r.item_type === "product") {
      customersWithProduct.add(cid);
    }
  }

  const customersWithoutRetail = [...customersAll].filter((cid) => !customersWithProduct.has(cid));

  const recentCustomers: StaffDrillDownCustomer[] = [...customerAgg.entries()]
    .map(([customer_id, v]) => ({
      customer_id,
      last_day: v.last_day,
      gross: v.gross,
      visits: v.visits.size,
    }))
    .sort((a, b) => (a.last_day < b.last_day ? 1 : a.last_day > b.last_day ? -1 : 0))
    .slice(0, 6);

  const dailyTrend: StaffDrillDownDay[] = [...dailyMap.entries()]
    .map(([day, v]) => ({ day, gross: v.gross, receipts: v.receipts.size }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const currentMoney = pickStaffMoney(input.current, mode);
  let periodComparison: StaffDrillDownData["periodComparison"] = null;

  if (input.previous) {
    const prevMoney = pickStaffMoney(input.previous, mode);
    const delta_pct =
      prevMoney.real > 0
        ? Math.round(((currentMoney.real - prevMoney.real) / prevMoney.real) * 1000) / 10
        : null;
    periodComparison = {
      previous_incassato: prevMoney.real,
      current_incassato: currentMoney.real,
      delta_pct,
    };
  }

  return {
    topServices: aggregateItems(staffRows, "service"),
    topProducts: aggregateItems(staffRows, "product"),
    recentCustomers,
    customersWithoutRetail: customersWithoutRetail.slice(0, 8).map((customer_id) => ({ customer_id })),
    discountedReceipts: input.current.discounted_receipts_count,
    totalReceipts: input.current.receipts_count,
    dailyTrend,
    periodComparison,
    retailSold: currentMoney.retail,
    servicesQty: input.current.services_qty,
    productsQty: input.current.products_qty,
    receiptsWithoutCustomer: input.current.receipts_without_customer,
  };
}
