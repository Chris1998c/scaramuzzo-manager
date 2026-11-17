import { describe, expect, it } from "vitest";
import {
  parseBossCollaboratorHeader,
  parseBossLav002Sheet,
  roundMoney2,
} from "./bossLav002XlsParse";
import { indexStaffByCode, matchLav002ByStaffCode } from "./bossLav002Match";

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

describe("parseBossLav002Sheet", () => {
  it("aggrega un blocco collaboratore da Totali collaboratore", () => {
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
      servicesGross: 544,
      productsGross: 0,
      totalGross: 544,
    });
    expect(parsed.collaborators[1]).toMatchObject({
      bossName: "DANIELA",
      bossCode: "204",
      servicesGross: 13241.06,
      productsGross: 394,
      totalGross: 13635.06,
    });
    expect(roundMoney2(parsed.grandTotalGross)).toBe(14179.06);
  });
});

describe("matchLav002ByStaffCode", () => {
  const index = indexStaffByCode([
    { id: 74, staff_code: "86", name: "Antonio", active: true },
    { id: 72, staff_code: "204", name: "Daniela", active: false },
    { id: 1, staff_code: "999", name: "A", active: true },
    { id: 2, staff_code: "999", name: "B", active: true },
  ]);

  it("match attivo univoco", () => {
    expect(matchLav002ByStaffCode("86", index).status).toBe("matched_active");
  });

  it("match disattivo univoco (ex collaboratore)", () => {
    const m = matchLav002ByStaffCode("204", index);
    expect(m.status).toBe("matched_inactive");
    expect(m.staffId).toBe(72);
  });

  it("unmatched senza inventare nome", () => {
    expect(matchLav002ByStaffCode("556", index).status).toBe("unmatched");
  });

  it("ambiguous ferma la corrispondenza", () => {
    expect(matchLav002ByStaffCode("999", index).status).toBe("ambiguous");
  });
});
