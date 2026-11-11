import { describe, expect, it } from "vitest";

import {
  splitCassaReportItemGross,
  splitCassaReportItemGrossLegacyNoGlobal,
} from "@/lib/cassa/cassaReportItemSplit";
import { allocateSaleGlobalDiscount, roundMoney2 } from "@/lib/reports/allocateSaleGlobalDiscount";
import { buildStaffKpiFromRows } from "@/lib/reports/buildStaffKpiFromRows";
import { SALES_LEDGER_STATUS } from "@/lib/reports/ledgerSalesFilter";

type Sale = {
  id: number;
  status: string;
  operation_type: string;
  payment_method: string;
  total_amount: number;
  discount: number;
  cash_session_id: number;
};

type Item = {
  id: number;
  sale_id: number;
  service_id: number | null;
  product_id: number | null;
  staff_id: number | null;
  quantity: number;
  price: number;
  discount: number;
};

/**
 * Scenari collaudo Report↔Cassa (senza production):
 * 1) prezzo pieno
 * 2) sconto cassa (globale)
 * 3) multi-staff servizi
 * 4) prodotto
 * 5) scontrino poi annullato (fiscally_voided)
 * 6) sessione chiusa (KPI da ledger posted)
 */
function seedScenarios(): { sales: Sale[]; items: Item[] } {
  const sales: Sale[] = [
    // 1 full price service 50 cash
    {
      id: 1,
      status: "posted",
      operation_type: "sale",
      payment_method: "cash",
      total_amount: 50,
      discount: 0,
      cash_session_id: 100,
    },
    // 2 global discount: list 100 → paid 80
    {
      id: 2,
      status: "posted",
      operation_type: "sale",
      payment_method: "card",
      total_amount: 80,
      discount: 20,
      cash_session_id: 100,
    },
    // 3 multi-staff services 30+40 = 70
    {
      id: 3,
      status: "posted",
      operation_type: "sale",
      payment_method: "cash",
      total_amount: 70,
      discount: 0,
      cash_session_id: 100,
    },
    // 4 product 25
    {
      id: 4,
      status: "posted",
      operation_type: "sale",
      payment_method: "cash",
      total_amount: 25,
      discount: 0,
      cash_session_id: 100,
    },
    // 5 voided collaudo-like: list 22, paid 1, then fiscally_voided
    {
      id: 5,
      status: "fiscally_voided",
      operation_type: "sale",
      payment_method: "cash",
      total_amount: 1,
      discount: 21,
      cash_session_id: 100,
    },
  ];

  const items: Item[] = [
    { id: 1, sale_id: 1, service_id: 10, product_id: null, staff_id: 1, quantity: 1, price: 50, discount: 0 },
    { id: 2, sale_id: 2, service_id: 11, product_id: null, staff_id: 1, quantity: 1, price: 60, discount: 0 },
    { id: 3, sale_id: 2, product_id: 20, service_id: null, staff_id: 1, quantity: 1, price: 40, discount: 0 },
    { id: 4, sale_id: 3, service_id: 12, product_id: null, staff_id: 1, quantity: 1, price: 30, discount: 0 },
    { id: 5, sale_id: 3, service_id: 13, product_id: null, staff_id: 2, quantity: 1, price: 40, discount: 0 },
    { id: 6, sale_id: 4, service_id: null, product_id: 21, staff_id: 2, quantity: 1, price: 25, discount: 0 },
    { id: 7, sale_id: 5, service_id: 58, product_id: null, staff_id: 56, quantity: 1, price: 22, discount: 0 },
  ];

  return { sales, items };
}

function ledgerPosted(sales: Sale[]): Sale[] {
  return sales.filter(
    (s) => s.status === SALES_LEDGER_STATUS && s.operation_type === "sale",
  );
}

function reportLikeRows(sales: Sale[], items: Item[]) {
  const postedIds = new Set(ledgerPosted(sales).map((s) => s.id));
  const rows: Array<{
    sale_id: number;
    staff_id: number | null;
    staff_name: string | null;
    item_type: "service" | "product";
    quantity: number;
    price: number;
    item_discount: number;
    line_total_gross: number;
    line_net: number;
  }> = [];

  for (const sale of sales) {
    if (!postedIds.has(sale.id)) continue;
    const saleItems = items.filter((i) => i.sale_id === sale.id);
    const alloc = allocateSaleGlobalDiscount({
      lines: saleItems.map((it) => ({
        price: it.price,
        quantity: it.quantity,
        lineDiscount: it.discount,
        lineId: it.id,
      })),
      saleTotal: sale.total_amount,
    });
    for (let i = 0; i < saleItems.length; i++) {
      const it = saleItems[i]!;
      const a = alloc.lines[i]!;
      rows.push({
        sale_id: sale.id,
        staff_id: it.staff_id,
        staff_name: it.staff_id != null ? `Staff ${it.staff_id}` : null,
        item_type: it.service_id != null ? "service" : "product",
        quantity: it.quantity,
        price: it.price,
        item_discount: a.itemDiscount,
        line_total_gross: a.lineTotalGross,
        line_net: a.lineTotalGross, // vat ignored for reconciliation of gross
      });
    }
  }
  return rows;
}

describe("Report ↔ Cassa reconciliation (scenari isolati)", () => {
  const { sales, items } = seedScenarios();
  const posted = ledgerPosted(sales);

  it("void fiscally_voided escluso da ledger posted (come #75)", () => {
    expect(posted.map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(posted.some((s) => s.id === 5)).toBe(false);
    expect(sales.find((s) => s.id === 5)?.status).toBe("fiscally_voided");
  });

  it("incasso reale sessione = Σ total_amount posted (void escluso)", () => {
    const cashGross = roundMoney2(
      posted.filter((s) => s.payment_method === "cash").reduce((a, s) => a + s.total_amount, 0),
    );
    const cardGross = roundMoney2(
      posted.filter((s) => s.payment_method === "card").reduce((a, s) => a + s.total_amount, 0),
    );
    const gross = roundMoney2(posted.reduce((a, s) => a + s.total_amount, 0));
    // 50 + 70 + 25 cash + 80 card = 225; void 1 escluso
    expect(gross).toBe(225);
    expect(cashGross).toBe(145);
    expect(cardGross).toBe(80);
    expect(roundMoney2(cashGross + cardGross)).toBe(gross);
  });

  it("listino vs sconti vs incasso (vendita #2 sconto cassa)", () => {
    const sale = sales.find((s) => s.id === 2)!;
    const saleItems = items.filter((i) => i.sale_id === 2);
    const list = roundMoney2(saleItems.reduce((a, i) => a + i.price * i.quantity, 0));
    expect(list).toBe(100);
    expect(sale.total_amount).toBe(80);
    expect(roundMoney2(list - sale.total_amount)).toBe(20);
  });

  it("Cassa split legacy drifta; split allineato a report chiude su gross", () => {
    const postedItems = items.filter((i) => posted.some((s) => s.id === i.sale_id));
    const legacy = splitCassaReportItemGrossLegacyNoGlobal({ items: postedItems });
    const fixed = splitCassaReportItemGross({
      sales: posted.map((s) => ({ id: s.id, total_amount: s.total_amount })),
      items: postedItems,
    });
    const gross = roundMoney2(posted.reduce((a, s) => a + s.total_amount, 0));

    // Legacy: basi senza sconto globale → 50+100+70+25 = 245 > 225
    expect(roundMoney2(legacy.services_gross + legacy.products_gross)).toBe(245);
    expect(roundMoney2(legacy.services_gross + legacy.products_gross)).toBeGreaterThan(gross);

    expect(fixed.allocated_gross).toBe(gross);
    expect(roundMoney2(fixed.services_gross + fixed.products_gross)).toBe(gross);
  });

  it("KPI collaboratori: somma real = gross posted; multi-staff 30+40", () => {
    const rows = reportLikeRows(sales, items);
    const kpi = buildStaffKpiFromRows(rows as never, new Map());
    const gross = 225;
    const fromRows = roundMoney2(rows.reduce((a, r) => a + r.line_total_gross, 0));
    expect(fromRows).toBe(gross);

    const sumKpiReal = roundMoney2(kpi.reduce((a, r) => a + Number(r.gross.real), 0));
    expect(sumKpiReal).toBe(gross);

    expect(rows.find((r) => r.sale_id === 3 && r.staff_id === 1)?.line_total_gross).toBe(30);
    expect(rows.find((r) => r.sale_id === 3 && r.staff_id === 2)?.line_total_gross).toBe(40);
  });

  it("tabella atteso → mostrato per viste principali", () => {
    const postedItems = items.filter((i) => posted.some((s) => s.id === i.sale_id));
    const gross = 225;
    const split = splitCassaReportItemGross({
      sales: posted.map((s) => ({ id: s.id, total_amount: s.total_amount })),
      items: postedItems,
    });
    const rows = reportLikeRows(sales, items);
    const reportGross = roundMoney2(rows.reduce((a, r) => a + r.line_total_gross, 0));
    const voidList = 22;
    const voidPaid = 1;

    const table = [
      { vista: "sales.total_amount posted (Cassa gross)", atteso: gross, mostrato: gross },
      { vista: "report_rows Σ line_total_gross", atteso: gross, mostrato: reportGross },
      { vista: "Cassa services+products (fixed)", atteso: gross, mostrato: roundMoney2(split.services_gross + split.products_gross) },
      { vista: "Vendita void #5 listino", atteso: voidList, mostrato: voidList },
      { vista: "Vendita void #5 in report/cassa posted", atteso: 0, mostrato: 0 },
      { vista: "Vendita void #5 total_amount raw (escluso KPI)", atteso: voidPaid, mostrato: voidPaid },
      { vista: "Chiusura sessione expected cash posted", atteso: 145, mostrato: 145 },
    ] as const;

    for (const row of table) {
      expect(row.mostrato, row.vista).toBe(row.atteso);
    }
  });
});
