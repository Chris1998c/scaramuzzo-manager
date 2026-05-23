/**
 * Aggregazione KPI staff da righe report_rows + mappa clienti per scontrino.
 */

import type { ReportRow } from "@/lib/reports/getSalonTurnover";
import {
  aggregateMoneyTriples,
  avgTicket,
  discountPercent,
  lineMoneyTriple,
  pickMoneyTriple,
  roundMoney,
  type MoneyTriple,
  type ReportLineInput,
  type VatDisplayMode,
} from "@/lib/reports/reportLineKpiMath";
import { computeRetailPenetration } from "@/lib/reports/retailPenetration";

export type StaffKpiRow = {
  staff_id: number;
  staff_name: string;
  customers_served: number;
  customers_with_retail: number;
  customers_without_retail: number;
  /** null se nessun cliente collegato agli scontrini. */
  retail_penetration_pct: number | null;
  services_qty: number;
  products_qty: number;
  receipts_count: number;
  discounted_receipts_count: number;
  /** Scontrini senza customer_id collegato. */
  receipts_without_customer: number;
  gross: MoneyTriple & {
    discount_pct: number;
    avg_ticket_real: number;
    avg_ticket_full: number;
    retail: number;
  };
  net: MoneyTriple & {
    discount_pct: number;
    avg_ticket_real: number;
    avg_ticket_full: number;
    retail: number;
  };
};

function toLineInput(r: ReportRow): ReportLineInput {
  return {
    price: r.price,
    quantity: r.quantity,
    item_discount: r.item_discount,
    line_total_gross: r.line_total_gross,
    line_net: r.line_net,
    line_vat: r.line_vat,
    vat_rate: r.vat_rate,
  };
}

type StaffAgg = {
  staff_id: number;
  staff_name: string;
  receipts: Set<number>;
  customers: Set<string>;
  customersWithRetail: Set<string>;
  discountedReceipts: Set<number>;
  receiptsWithoutCustomer: Set<number>;
  services_qty: number;
  products_qty: number;
  lines: ReportLineInput[];
  retail_gross: number;
  retail_net: number;
};

export function buildStaffKpiFromRows(
  rows: ReportRow[],
  customerBySaleId: Map<number, string>,
): StaffKpiRow[] {
  const map = new Map<number, StaffAgg>();

  for (const r of rows) {
    const sid = Number(r.staff_id ?? 0);
    if (!sid) continue;

    if (!map.has(sid)) {
      map.set(sid, {
        staff_id: sid,
        staff_name: String(r.staff_name ?? `Staff ${sid}`),
        receipts: new Set(),
        customers: new Set(),
        customersWithRetail: new Set(),
        discountedReceipts: new Set(),
        receiptsWithoutCustomer: new Set(),
        services_qty: 0,
        products_qty: 0,
        lines: [],
        retail_gross: 0,
        retail_net: 0,
      });
    }

    const agg = map.get(sid)!;
    const line = toLineInput(r);
    agg.lines.push(line);

    const saleId = Number(r.sale_id);
    if (Number.isFinite(saleId) && saleId > 0) {
      agg.receipts.add(saleId);
      const cid = customerBySaleId.get(saleId);
      if (cid) {
        agg.customers.add(cid);
      } else {
        agg.receiptsWithoutCustomer.add(saleId);
      }
      if (Number(r.item_discount) > 0) {
        agg.discountedReceipts.add(saleId);
      }
    }

    const qty = Number(r.quantity) || 1;
    if (r.item_type === "service") {
      agg.services_qty += qty;
    }
    if (r.item_type === "product") {
      agg.products_qty += qty;
      agg.retail_gross += line.line_total_gross;
      agg.retail_net += line.line_net;
      if (Number.isFinite(saleId) && saleId > 0) {
        const cid = customerBySaleId.get(saleId);
        if (cid) agg.customersWithRetail.add(cid);
      }
    }
  }

  return Array.from(map.values())
    .map((agg) => {
      const money = aggregateMoneyTriples(agg.lines);
      const receipts = agg.receipts.size;

      const enrich = (triple: MoneyTriple, retail: number) => ({
        ...triple,
        discount_pct: discountPercent(triple.full, triple.discount),
        avg_ticket_real: avgTicket(triple.real, receipts),
        avg_ticket_full: avgTicket(triple.full, receipts),
        retail: roundMoney(retail),
      });

      const penetration = computeRetailPenetration(
        agg.customers.size,
        agg.customersWithRetail.size,
      );

      return {
        staff_id: agg.staff_id,
        staff_name: agg.staff_name,
        customers_served: penetration.customers_served,
        customers_with_retail: penetration.customers_with_retail,
        customers_without_retail: penetration.customers_without_retail,
        retail_penetration_pct: penetration.retail_penetration_pct,
        services_qty: agg.services_qty,
        products_qty: agg.products_qty,
        receipts_count: receipts,
        discounted_receipts_count: agg.discountedReceipts.size,
        receipts_without_customer: agg.receiptsWithoutCustomer.size,
        gross: enrich(money.gross, agg.retail_gross),
        net: enrich(money.net, agg.retail_net),
      };
    })
    .sort((a, b) => b.gross.real - a.gross.real);
}

export function pickStaffMoney(row: StaffKpiRow, mode: VatDisplayMode) {
  return mode === "gross" ? row.gross : row.net;
}

export function pickStaffRetail(row: StaffKpiRow, mode: VatDisplayMode): number {
  return pickStaffMoney(row, mode).retail;
}

export { pickMoneyTriple, lineMoneyTriple };
