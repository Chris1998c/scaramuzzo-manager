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

describe("parseBossRic011PdfText", () => {
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
    expect(p.salonLabel).toBe("Cosenza");
    expect(p.salonCode).toBe(4);
    expect(p.periodFrom).toBe("2022-01-01");
    expect(p.periodTo).toBe("2026-10-31");
    expect(p.days).toHaveLength(2);
    expect(p.days[0]).toMatchObject({
      day: "2022-01-03",
      total_cents: 83100,
      folded: { prod_salone_cents: 2400, serv_salone_cents: 68900, total_cents: 83100 },
    });
    expect(p.controlTotalCents).toBe(118500);
    expect(centsToEuros(p.days.reduce((s, d) => s + d.total_cents, 0))).toBe(1185);
  });

  it("fold prod_altro e solarium nelle colonne legacy", () => {
    const text = `
Riepilogo Incassi per Linee Cosenza (4)
dal 01/01/2022 al 31/01/2022
RIC011
  01/01/2022                      0,00        17,00      10,00        0,00          0,00      100,00        5,00      132,00
`;
    const p = parseBossRic011PdfText(text);
    expect(p.days[0]!.folded).toEqual({
      viacard_cents: 0,
      prod_salone_cents: 2700,
      serv_altro_cents: 0,
      serv_estetica_cents: 0,
      serv_salone_cents: 10500,
      total_cents: 13200,
    });
  });
});

describe("helpers", () => {
  it("dmyToIso", () => {
    expect(dmyToIso("31/10/2026")).toBe("2026-10-31");
  });

  it("parseRic011ControlTotalCents", () => {
    const line =
      "        Totale                 870,00         17,00   67.562,27   13.574,50     82.803,16 1.202.815,79      375,00 1.368.017,72";
    expect(parseRic011ControlTotalCents(line)).toBe(136801772);
  });
});
