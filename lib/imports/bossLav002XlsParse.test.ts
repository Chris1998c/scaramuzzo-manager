import { describe, expect, it } from "vitest";
import {
  centsToEuros,
  eurosToCents,
  parseBossCollaboratorHeader,
  parseBossLav002Sheet,
} from "./bossLav002XlsParse";

describe("parseBossCollaboratorHeader", () => {
  it("estrae nome e codice con spazi multipli", () => {
    expect(parseBossCollaboratorHeader("ENRICO VOLA  47 ")).toEqual({
      bossName: "ENRICO VOLA",
      bossCode: "47",
    });
  });

  it("gestisce Antonio 86", () => {
    expect(parseBossCollaboratorHeader("Antonio 86 ")).toEqual({
      bossName: "Antonio",
      bossCode: "86",
    });
  });

  it("rifiuta righe senza codice", () => {
    expect(parseBossCollaboratorHeader("SERVIZI")).toBeNull();
  });
});

describe("eurosToCents", () => {
  it("arrotonda float Boss a centesimi senza scarto sulla somma", () => {
    expect(eurosToCents(19813.607421875)).toBe(1981361);
    expect(eurosToCents(13635.060546875)).toBe(1363506);
    const parts = [19813.607421875, 14324.8017578125, 544, 13635.060546875];
    const sumCents = parts.reduce((s, n) => s + eurosToCents(n), 0);
    expect(centsToEuros(sumCents)).toBe(48317.47);
  });
});

describe("parseBossLav002Sheet", () => {
  it("aggrega un blocco collaboratore in centesimi, senza staff match", () => {
    const rows = [
      ["Vendita Diretta", "", "", ""],
      ["Descrizione", "Qta", "% Qta", "Valore (€)"],
      ["Antonio 86 "],
      ["Salone: Scaramuzzo Hair Natural Beauty "],
      ["SERVIZI", 32, "", 544],
      ["Totali", 32, "", 544],
      ["Totale generale per salone", 32, "", 544],
      ["Totali collaboratore", 32, "", 544],
      ["Totale generale per Antonio 86 ", 32, "", 544],
      [],
      ["DANIELA 204 "],
      ["Salone: Scaramuzzo Hair Natural Beauty "],
      ["SERVIZI", 810, "", 13241.06],
      ["PRODOTTI", 21, "", 394],
      ["Totali", 831, "", 13635.06],
      ["Totali collaboratore", 831, "", 13635.06],
    ];
    const parsed = parseBossLav002Sheet(rows, "LAV002");
    expect(parsed.collaborators).toHaveLength(2);
    expect(parsed.collaborators[0]).toMatchObject({
      bossName: "Antonio",
      bossCode: "86",
      servicesGrossCents: 54400,
      productsGrossCents: 0,
      totalGrossCents: 54400,
    });
    expect(parsed.collaborators[1]).toMatchObject({
      bossName: "DANIELA",
      bossCode: "204",
      servicesGrossCents: 1324106,
      productsGrossCents: 39400,
      totalGrossCents: 1363506,
    });
    expect(parsed.grandTotalCents).toBe(54400 + 1363506);
    expect(centsToEuros(parsed.grandTotalCents)).toBe(14179.06);
  });
});
