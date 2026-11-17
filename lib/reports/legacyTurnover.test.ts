import { describe, expect, it } from "vitest";
import { combineLegacyTurnover, summarizeLegacyTurnover } from "./legacyTurnover";

describe("incassi storici nel Report", () => {
  it("somma centesimi senza duplicare una vendita del gestionale sullo stesso giorno", () => {
    const live = [
      { sale_id: 1, sale_day: "2026-10-31", line_total_gross: 20 },
      { sale_id: 2, sale_day: "2026-11-16", line_total_gross: 12.34 },
    ];
    const result = combineLegacyTurnover(live, [{ day: "2026-10-31", total_gross: 90.01 }]);
    expect(result.gross_total).toBe(102.35);
    expect(result.eligibleLive).toEqual([live[1]]);
  });

  it("mantiene le sole vendite operative dove non esiste storico", () => {
    expect(combineLegacyTurnover([{ sale_id: 1, sale_day: "2027-01-01", line_total_gross: 19.99 }], []).gross_total).toBe(19.99);
  });

  it("raggruppa lo storico per anno senza perdere centesimi o inventare giorni vuoti", () => {
    expect(summarizeLegacyTurnover([
      { day: "2023-01-02", total_gross: 0.20 },
      { day: "2022-01-03", total_gross: 0.10 },
      { day: "2022-01-04", total_gross: 0.30 },
    ])).toEqual({
      firstDay: "2022-01-03", lastDay: "2023-01-02", days: 3, totalGross: 0.60,
      years: [{ year: 2022, days: 2, totalGross: 0.40 }, { year: 2023, days: 1, totalGross: 0.20 }],
    });
    expect(summarizeLegacyTurnover([])).toBeNull();
  });
});
