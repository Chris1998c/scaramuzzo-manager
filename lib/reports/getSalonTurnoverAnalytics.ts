// lib/reports/getSalonTurnoverAnalytics.ts

import { getSalonTurnover, TurnoverFilters } from "./getSalonTurnover";
import { buildStaffKpiFromRows } from "./buildStaffKpiFromRows";
import { fetchCustomerIdsForRows } from "./reportSaleCustomers";

function shiftPeriod(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  const diff = to.getTime() - from.getTime();

  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diff);

  return {
    prevFrom: prevFrom.toISOString().slice(0, 10),
    prevTo: prevTo.toISOString().slice(0, 10),
  };
}

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getSalonTurnoverAnalytics(filters: TurnoverFilters) {
  const { totals, rows } = await getSalonTurnover(filters);

  // =========================
  // GIORNALIERO
  // =========================

  const dailyMap = new Map<
    string,
    {
      day: string;
      receipts: Set<number>;
      gross: number;
      net: number;
      vat: number;
      discount: number;
    }
  >();

  for (const r of rows) {
    const day = String((r as any).sale_day ?? "");
    if (!day) continue;

    if (!dailyMap.has(day)) {
      dailyMap.set(day, {
        day,
        receipts: new Set<number>(),
        gross: 0,
        net: 0,
        vat: 0,
        discount: 0,
      });
    }

    const x = dailyMap.get(day)!;

    x.receipts.add(Number((r as any).sale_id));
    x.gross += n((r as any).line_total_gross);
    x.net += n((r as any).line_net);
    x.vat += n((r as any).line_vat);
    x.discount += n((r as any).item_discount);
  }

  const daily = Array.from(dailyMap.values())
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((x) => ({
      day: x.day,
      receipts_count: x.receipts.size,
      gross_total: x.gross,
      net_total: x.net,
      vat_total: x.vat,
      discount_total: x.discount,
    }));

  // =========================
  // TOP ITEMS
  // =========================

  const topMap = new Map<
    string,
    {
      key: string;
      item_type: string;
      name: string;
      quantity: number;
      gross: number;
      net: number;
    }
  >();

  for (const r of rows) {
    const rr: any = r;
    const name =
      rr.item_type === "product"
        ? String(rr.product_name ?? "Prodotto")
        : String(rr.service_name ?? "Servizio");

    const key = `${rr.item_type}::${name}`;

    if (!topMap.has(key)) {
      topMap.set(key, {
        key,
        item_type: rr.item_type,
        name,
        quantity: 0,
        gross: 0,
        net: 0,
      });
    }

    const x = topMap.get(key)!;

    x.quantity += n(rr.quantity ?? 1);
    x.gross += n(rr.line_total_gross);
    x.net += n(rr.line_net);
  }

  const topItems = Array.from(topMap.values())
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 15)
    .map((x) => ({
      key: x.key,
      item_type: x.item_type,
      name: x.name,
      quantity: x.quantity,
      gross_total: x.gross,
      net_total: x.net,
    }));

  // =========================
  // STAFF PERFORMANCE (enterprise KPI)
  // =========================

  const customerBySale = await fetchCustomerIdsForRows(rows);
  const staffPerformance = buildStaffKpiFromRows(rows, customerBySale);

  // =========================
  // CONFRONTO PERIODO PRECEDENTE
  // =========================

  const { prevFrom, prevTo } = shiftPeriod(filters.dateFrom, filters.dateTo);

  const { totals: previousTotals } = await getSalonTurnover({
    ...filters,
    dateFrom: prevFrom,
    dateTo: prevTo,
  });

  return {
    totals,
    rows,
    daily,
    topItems,
    staffPerformance,
    previousTotals,
  };
}