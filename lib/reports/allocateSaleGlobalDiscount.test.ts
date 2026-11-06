import { describe, expect, it } from "vitest";

import {
  allocateGlobalDiscountShares,
  allocateSaleGlobalDiscount,
  fromCents,
  lineBaseNetAfterLineDiscount,
  resolveGlobalDiscountPool,
  roundMoney2,
  toCents,
} from "@/lib/reports/allocateSaleGlobalDiscount";
import {
  aggregateMoneyTriples,
  type ReportLineInput,
} from "@/lib/reports/reportLineKpiMath";

function assertValidShares(
  bases: number[],
  shares: number[],
  pool: number,
) {
  expect(shares.length).toBe(bases.length);
  let sum = 0;
  for (let i = 0; i < shares.length; i++) {
    expect(shares[i]).toBeGreaterThanOrEqual(0);
    expect(shares[i]).toBeLessThanOrEqual(bases[i] + 1e-9);
    if (bases[i] === 0) expect(shares[i]).toBe(0);
    sum = roundMoney2(sum + shares[i]);
  }
  expect(sum).toBe(roundMoney2(Math.min(pool, roundMoney2(bases.reduce((a, b) => a + b, 0)))));
}

function asReportRows(
  lines: {
    price: number;
    qty: number;
    lineDisc: number;
    staff_id: number;
    lineId: number;
  }[],
  saleTotal: number,
  vatRate = 0,
): ReportLineInput[] {
  const allocated = allocateSaleGlobalDiscount({
    lines: lines.map((l) => ({
      price: l.price,
      quantity: l.qty,
      lineDiscount: l.lineDisc,
      lineId: l.lineId,
    })),
    saleTotal,
  });
  return allocated.lines.map((a, i) => {
    const price = lines[i].price;
    const quantity = lines[i].qty;
    const line_total_gross = a.lineTotalGross;
    const line_net =
      vatRate > 0
        ? roundMoney2(line_total_gross / (1 + vatRate / 100))
        : line_total_gross;
    return {
      price,
      quantity,
      item_discount: a.itemDiscount,
      line_total_gross,
      line_net,
      vat_rate: vatRate,
    };
  });
}

describe("allocateSaleGlobalDiscount (Hamilton / maggiori resti)", () => {
  it("solo sconti riga: pool 0", () => {
    const lines = [
      { price: 50, quantity: 1, lineDiscount: 5, lineId: 1 },
      { price: 30, quantity: 2, lineDiscount: 10, lineId: 2 },
    ];
    const out = allocateSaleGlobalDiscount({ lines, saleTotal: 95 });
    expect(out.globalPool).toBe(0);
    expect(out.lines.map((x) => x.globalShare)).toEqual([0, 0]);
    expect(out.lines.map((x) => x.lineTotalGross)).toEqual([45, 50]);
  });

  it("solo sconto globale proporzionale", () => {
    const lines = [
      { price: 100, quantity: 1, lineDiscount: 0, lineId: 10 },
      { price: 50, quantity: 1, lineDiscount: 0, lineId: 20 },
    ];
    const out = allocateSaleGlobalDiscount({ lines, saleTotal: 135 });
    expect(out.lines.map((x) => x.globalShare)).toEqual([10, 5]);
    expect(roundMoney2(out.lines.reduce((s, x) => s + x.lineTotalGross, 0))).toBe(
      135,
    );
  });

  it("sconto riga + globale senza doppio conteggio", () => {
    const lines = [
      { price: 100, quantity: 1, lineDiscount: 20, lineId: 1 },
      { price: 50, quantity: 1, lineDiscount: 10, lineId: 2 },
    ];
    const out = allocateSaleGlobalDiscount({ lines, saleTotal: 108 });
    expect(out.lines.map((x) => x.baseNet)).toEqual([80, 40]);
    expect(out.lines.map((x) => x.globalShare)).toEqual([8, 4]);
    expect(out.lines.map((x) => x.itemDiscount)).toEqual([28, 14]);
    expect(roundMoney2(out.lines.reduce((s, x) => s + x.lineTotalGross, 0))).toBe(
      108,
    );
  });

  it("quattro righe da 0,01 € con globale 0,02 €", () => {
    const bases = [0.01, 0.01, 0.01, 0.01];
    const ids = [101, 102, 103, 104];
    const shares = allocateGlobalDiscountShares(bases, 0.02, ids);
    // ideal 0.5¢ ciascuno → floor 0; 2 centesimi ai minori id
    expect(shares).toEqual([0.01, 0.01, 0, 0]);
    assertValidShares(bases, shares, 0.02);

    const out = allocateSaleGlobalDiscount({
      lines: bases.map((b, i) => ({
        price: b,
        quantity: 1,
        lineDiscount: 0,
        lineId: ids[i],
      })),
      saleTotal: 0.02,
    });
    expect(out.lines.map((x) => x.lineTotalGross)).toEqual([0, 0, 0.01, 0.01]);
    expect(roundMoney2(out.lines.reduce((s, x) => s + x.lineTotalGross, 0))).toBe(
      0.02,
    );
  });

  it("ultima riga gratuita riceve zero; residui su basi positive", () => {
    const bases = [10, 10, 0];
    const ids = [1, 2, 3];
    const shares = allocateGlobalDiscountShares(bases, 0.05, ids);
    expect(shares[2]).toBe(0);
    assertValidShares(bases, shares, 0.05);
    expect(roundMoney2(shares[0] + shares[1])).toBe(0.05);
  });

  it("sconto 100%: tutte le basi a zero → quote zero", () => {
    const lines = [
      { price: 40, quantity: 1, lineDiscount: 40, lineId: 1 },
      { price: 20, quantity: 1, lineDiscount: 20, lineId: 2 },
    ];
    const out = allocateSaleGlobalDiscount({ lines, saleTotal: 0 });
    expect(out.lines.every((x) => x.baseNet === 0)).toBe(true);
    expect(out.lines.every((x) => x.globalShare === 0)).toBe(true);
    expect(out.lines.every((x) => x.lineTotalGross === 0)).toBe(true);
  });

  it("centesimi: maggiori resti con spareggio per lineId", () => {
    // 3×10 €, pool 0.10 → floor 0.03 ciascuno, 1¢ al lineId minore
    const shares = allocateGlobalDiscountShares([10, 10, 10], 0.1, [3, 1, 2]);
    expect(shares).toEqual([0.03, 0.04, 0.03]); // id 1 vince lo spareggio
    assertValidShares([10, 10, 10], shares, 0.1);
  });

  it("collaboratori diversi: KPI proporzionali alle righe allocate", () => {
    const lines = [
      { price: 100, qty: 1, lineDisc: 0, staff_id: 1, lineId: 11 },
      { price: 50, qty: 1, lineDisc: 0, staff_id: 2, lineId: 22 },
    ];
    const rows = asReportRows(lines, 135);
    const staff1 = aggregateMoneyTriples([rows[0]]);
    const staff2 = aggregateMoneyTriples([rows[1]]);
    expect(staff1.gross.real).toBe(90);
    expect(staff2.gross.real).toBe(45);
    expect(staff1.gross.real + staff2.gross.real).toBe(135);
  });

  it("saleTotal > basi: anomalia, nessun sconto inventato", () => {
    const out = allocateSaleGlobalDiscount({
      lines: [{ price: 50, quantity: 1, lineDiscount: 0, lineId: 1 }],
      saleTotal: 60,
    });
    expect(out.anomalies).toContain("sale_total_exceeds_line_bases");
    expect(out.globalPool).toBe(0);
    expect(out.lines[0].lineTotalGross).toBe(50);
  });

  it("explicitGlobal allineato a finalTotal cassa", () => {
    const lines = [
      { price: 100, quantity: 1, lineDiscount: 0, lineId: 0 },
      { price: 50, quantity: 1, lineDiscount: 0, lineId: 1 },
    ];
    const out = allocateSaleGlobalDiscount({
      lines,
      saleTotal: 135,
      explicitGlobal: 15,
    });
    expect(out.globalPool).toBe(15);
    expect(roundMoney2(out.lines.reduce((s, x) => s + x.lineTotalGross, 0))).toBe(
      135,
    );
    // Nessuna doppia applicazione: itemDiscount == solo quota globale (lineDisc=0)
    expect(out.lines.map((x) => x.itemDiscount)).toEqual(
      out.lines.map((x) => x.globalShare),
    );
  });

  it("helper centesimi stabile", () => {
    expect(toCents(0.1)).toBe(10);
    expect(fromCents(10)).toBe(0.1);
    expect(lineBaseNetAfterLineDiscount({ price: 10, quantity: 1, lineDiscount: 0 })).toBe(
      10,
    );
    expect(resolveGlobalDiscountPool({ basesSum: 10, saleTotal: -1 }).anomalies).toContain(
      "negative_sale_total_clamped",
    );
  });
});
