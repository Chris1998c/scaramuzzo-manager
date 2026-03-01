// lib/reports/getSalonTurnoverAnalytics.ts

import { getSalonTurnover, TurnoverFilters } from "./getSalonTurnover";

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
  // STAFF PERFORMANCE (BOSS-LIKE)
  // =========================

  const staffMap = new Map<
    string,
    {
      staff_id: number;
      staff_name: string;
      receipts: Set<number>;
      gross: number;
      net: number;

      services_gross: number;
      products_gross: number;

      services_qty: number;
      products_qty: number;
    }
  >();

  for (const r of rows) {
    const rr: any = r;
    const sid = Number(rr.staff_id ?? 0);
    if (!sid) continue;

    const sname = String(rr.staff_name ?? `Staff ${sid}`);
    const key = `${sid}`;

    if (!staffMap.has(key)) {
      staffMap.set(key, {
        staff_id: sid,
        staff_name: sname,
        receipts: new Set<number>(),
        gross: 0,
        net: 0,
        services_gross: 0,
        products_gross: 0,
        services_qty: 0,
        products_qty: 0,
      });
    }

    const x = staffMap.get(key)!;

    const lineGross = n(rr.line_total_gross);
    const lineNet = n(rr.line_net);
    const qty = n(rr.quantity ?? 1);

    x.receipts.add(Number(rr.sale_id));
    x.gross += lineGross;
    x.net += lineNet;

    if (rr.item_type === "service") {
      x.services_gross += lineGross;
      x.services_qty += qty;
    }

    if (rr.item_type === "product") {
      x.products_gross += lineGross;
      x.products_qty += qty;
    }
  }

  const staffPerformance = Array.from(staffMap.values())
    .sort((a, b) => b.gross - a.gross)
    .map((x) => {
      const receipts_count = x.receipts.size;

      const avg_ticket =
        receipts_count > 0 ? x.gross / receipts_count : 0;

      const services_avg_price =
        x.services_qty > 0 ? x.services_gross / x.services_qty : 0;

      const products_avg_price =
        x.products_qty > 0 ? x.products_gross / x.products_qty : 0;

      return {
        staff_id: x.staff_id,
        staff_name: x.staff_name,

        receipts_count,

        // fatturato
        gross_total: x.gross,
        net_total: x.net,
        gross_services: x.services_gross,
        gross_products: x.products_gross,

        // quantità
        services_qty: x.services_qty,
        products_qty: x.products_qty,

        // medie (Boss-style)
        avg_ticket,
        services_avg_price,
        products_avg_price,
      };
    });

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