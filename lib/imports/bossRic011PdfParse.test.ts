import { describe, expect, it } from "vitest";
import {
  centsToEuros,
  dmyToIso,
  italianMoneyToCents,
  parseBossRic011PdfText,
  parseRic011ControlTotalCents,
} from "./bossRic011PdfParse";

describe("italianMoneyToCents", () => {
  it("gestisce migliaia e segno", () => {
    expect(italianMoneyToCents("1.368.017,72")).toBe(136801772);
    expect(italianMoneyToCents("-12,50")).toBe(-1250);
    expect(italianMoneyToCents("0,00")).toBe(0);
  });
});

describe("parseBossRic011PdfText layout 8 (Cosenza)", () => {
  const sample = `
Riepilogo Incassi per Linee Cosenza (4)
dal 01/01/2022 al 31/10/2026
RIC011 - INCASSI PER LINEE
  03/01/2022                      0,00         0,00      24,00        0,00        118,00      689,00         0,00      831,00
  04/01/2022                      0,00         0,00      54,00        0,00          0,00      300,00         0,00      354,00
        Totale                 0,00         0,00       78,00        0,00        118,00      989,00         0,00    1.185,00
`;

  it("estrae sede, periodo e giorni escludendo il totale", () => {
    const p = parseBossRic011PdfText(sample);
    expect(p.columnLayout).toBe(8);
    expect(p.salonLabel).toBe("Cosenza");
    expect(p.salonCode).toBe(4);
    expect(p.periodFrom).toBe("2022-01-01");
    expect(p.periodTo).toBe("2026-10-31");
    expect(p.days).toHaveLength(2);
    expect(p.days[0]).toMatchObject({
      day: "2022-01-03",
      total_cents: 83100,
      serv_payback_cents: 0,
      folded: { prod_salone_cents: 2400, serv_salone_cents: 68900, total_cents: 83100 },
    });
    expect(p.controlTotalCents).toBe(118500);
    expect(centsToEuros(p.days.reduce((s, d) => s + d.total_cents, 0))).toBe(1185);
  });
});

describe("parseBossRic011PdfText layout 6 (Castrovillari)", () => {
  const sample = `
Riepilogo Incassi per Linee Castrovillari (3)
dal 01/01/2022 al 31/10/2026
RIC011
  03/01/2022                      0,00          0,00       0,00         26,00      170,00      196,00
  04/01/2022                      0,00         52,00       0,00         37,00      816,00      905,00
        Totale                0,00         52,00       0,00         63,00      986,00    1.101,00
`;

  it("estrae 6 colonne senza inventare linee assenti", () => {
    const p = parseBossRic011PdfText(sample);
    expect(p.columnLayout).toBe(6);
    expect(p.salonCode).toBe(3);
    expect(p.days).toHaveLength(2);
    expect(p.days[0]).toMatchObject({
      day: "2022-01-03",
      prod_altro_cents: 0,
      serv_payback_cents: 0,
      serv_solarium_cents: 0,
      total_cents: 19600,
      folded: { total_cents: 19600, serv_salone_cents: 17000 },
    });
    expect(p.controlTotalCents).toBe(110100);
  });
});

describe("parseBossRic011PdfText layout 9 (Corigliano + PAYBACK)", () => {
  const sample = `
Riepilogo Incassi per Linee Corigliano (2)
dal 01/01/2022 al 31/10/2026
SERV_PAYBACK
RIC011
  03/01/2022                      0,00         0,00        0,00       0,00          0,00        0,00        42,00        0,00       42,00
  04/01/2022                      0,00         0,00      83,00        0,00         50,00       10,00      607,00         0,00      750,00
        Totale                 0,00         0,00       83,00        0,00         50,00       10,00      649,00         0,00      792,00
`;

  it("fold payback in serv_salone e riconcilia il totale", () => {
    const p = parseBossRic011PdfText(sample);
    expect(p.columnLayout).toBe(9);
    expect(p.salonCode).toBe(2);
    expect(p.days).toHaveLength(2);
    expect(p.days[1]).toMatchObject({
      day: "2022-01-04",
      serv_payback_cents: 1000,
      total_cents: 75000,
      folded: {
        prod_salone_cents: 8300,
        serv_salone_cents: 61700, // 607 + 10 payback
        total_cents: 75000,
      },
    });
    expect(p.controlTotalCents).toBe(79200);
  });
});

describe("helpers", () => {
  it("dmyToIso", () => {
    expect(dmyToIso("31/10/2026")).toBe("2026-10-31");
  });

  it("parseRic011ControlTotalCents 8 linee (Corigliano)", () => {
    const line =
      "        Totale                 653,00        180,00   120.639,08   7.375,00    162.717,40       30,00   922.562,54       66,00 1.214.223,02";
    expect(parseRic011ControlTotalCents(line, 8)).toBe(121422302);
  });
});
