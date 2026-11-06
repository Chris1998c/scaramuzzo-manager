import { describe, expect, it } from "vitest";

import {
  allocateSaleGlobalDiscount,
  roundMoney2,
} from "@/lib/reports/allocateSaleGlobalDiscount";

/**
 * Specchio di buildFiscalSaleReceiptLines (cassa/close): totali riga già netti
 * di sconto riga+globale, senza secondo sconto nel payload bridge.
 */
function buildFiscalTotals(args: {
  unitPrices: number[];
  qtys: number[];
  lineDiscs: number[];
  globalDiscountAmount: number;
  finalTotal: number;
}) {
  const allocated = allocateSaleGlobalDiscount({
    lines: args.unitPrices.map((price, index) => ({
      price,
      quantity: args.qtys[index],
      lineDiscount: args.lineDiscs[index],
      lineId: index,
    })),
    saleTotal: args.finalTotal,
    explicitGlobal: args.globalDiscountAmount,
  });
  return allocated.lines.map((l, i) => {
    const qty = args.qtys[i];
    const total = l.lineTotalGross;
    return {
      quantity: qty,
      unit_price: qty > 0 ? roundMoney2(total / qty) : roundMoney2(total),
      total,
      globalShare: l.globalShare,
      lineDisc: args.lineDiscs[i],
    };
  });
}

describe("scontrino fiscale / bridge payload", () => {
  it("somma righe = finalTotal; nessuna doppia applicazione dello sconto", () => {
    const unitPrices = [100, 50];
    const qtys = [1, 1];
    const lineDiscs = [0, 0];
    const globalDiscountAmount = 15;
    const finalTotal = 135;
    const lines = buildFiscalTotals({
      unitPrices,
      qtys,
      lineDiscs,
      globalDiscountAmount,
      finalTotal,
    });
    expect(roundMoney2(lines.reduce((s, l) => s + l.total, 0))).toBe(finalTotal);
    // totali già scontati: non si sottrae di nuovo lineDisc+global sul payload
    expect(lines.map((l) => l.total)).toEqual([90, 45]);
    expect(lines.every((l) => l.globalShare >= 0)).toBe(true);
  });

  it("riga+globale: payload usa solo netto finale per riga", () => {
    const lines = buildFiscalTotals({
      unitPrices: [100, 50],
      qtys: [1, 1],
      lineDiscs: [20, 10],
      globalDiscountAmount: 12,
      finalTotal: 108,
    });
    expect(lines.map((l) => l.total)).toEqual([72, 36]);
    expect(roundMoney2(lines.reduce((s, l) => s + l.total, 0))).toBe(108);
  });

  it("quattro da 0,01 con globale 0,02: totali fiscali coerenti", () => {
    const lines = buildFiscalTotals({
      unitPrices: [0.01, 0.01, 0.01, 0.01],
      qtys: [1, 1, 1, 1],
      lineDiscs: [0, 0, 0, 0],
      globalDiscountAmount: 0.02,
      finalTotal: 0.02,
    });
    expect(lines.map((l) => l.total)).toEqual([0, 0, 0.01, 0.01]);
    expect(roundMoney2(lines.reduce((s, l) => s + l.total, 0))).toBe(0.02);
  });
});
