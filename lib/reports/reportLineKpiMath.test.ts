import { describe, expect, it } from "vitest";

import {
  aggregateMoneyTriples,
  avgTicket,
  discountPercent,
  lineDiscountGross,
  lineDiscountNet,
  lineFullGross,
  lineFullNet,
  lineMoneyTriple,
  lineRealGross,
  lineRealNet,
  pickMoneyTriple,
  pctChange,
  type ReportLineInput,
} from "@/lib/reports/reportLineKpiMath";

const baseLine: ReportLineInput = {
  price: 50,
  quantity: 2,
  item_discount: 10,
  line_total_gross: 90, // 50*2 - 10
  line_net: 73.77,
  vat_rate: 22,
};

describe("reportLineKpiMath", () => {
  it("calcola valore pieno lordo da prezzo × qty", () => {
    expect(lineFullGross(baseLine)).toBe(100);
  });

  it("calcola incasso reale lordo da line_total_gross", () => {
    expect(lineRealGross(baseLine)).toBe(90);
  });

  it("calcola sconto lordo da item_discount", () => {
    expect(lineDiscountGross(baseLine)).toBe(10);
  });

  it("calcola netto pieno scorporando IVA", () => {
    expect(lineFullNet(baseLine)).toBe(81.97);
  });

  it("calcola netto reale da line_net", () => {
    expect(lineRealNet(baseLine)).toBe(73.77);
  });

  it("calcola sconto netto con IVA", () => {
    expect(lineDiscountNet(baseLine)).toBe(8.2);
  });

  it("bundle gross/net coerente per riga", () => {
    const t = lineMoneyTriple(baseLine);
    expect(t.gross.real).toBe(90);
    expect(t.gross.full).toBe(100);
    expect(t.gross.discount).toBe(10);
    expect(t.net.real).toBe(73.77);
    expect(t.net.full).toBe(81.97);
    expect(t.net.discount).toBe(8.2);
  });

  it("aggrega più righe", () => {
    const lines: ReportLineInput[] = [
      baseLine,
      {
        price: 30,
        quantity: 1,
        item_discount: 0,
        line_total_gross: 30,
        line_net: 24.59,
        vat_rate: 22,
      },
    ];
    const agg = aggregateMoneyTriples(lines);
    expect(agg.gross.real).toBe(120);
    expect(agg.gross.full).toBe(130);
    expect(agg.gross.discount).toBe(10);
  });

  it("pickMoneyTriple rispetta modalità IVA", () => {
    const bundle = lineMoneyTriple(baseLine);
    expect(pickMoneyTriple(bundle, "gross").real).toBe(90);
    expect(pickMoneyTriple(bundle, "net").real).toBe(73.77);
  });

  it("fallback sconto lordo quando item_discount = 0", () => {
    const line: ReportLineInput = {
      price: 40,
      quantity: 1,
      item_discount: 0,
      line_total_gross: 35,
      line_net: 28.69,
      vat_rate: 22,
    };
    expect(lineDiscountGross(line)).toBe(5);
  });

  it("discountPercent e avgTicket", () => {
    expect(discountPercent(100, 10)).toBe(10);
    expect(avgTicket(300, 3)).toBe(100);
  });

  it("pctChange periodo precedente", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(100, 0)).toBeNull();
  });
});
