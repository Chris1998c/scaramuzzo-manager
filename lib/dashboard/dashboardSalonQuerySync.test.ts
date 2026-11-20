import { describe, expect, it } from "vitest";
import { nextDashboardSalonQueryId } from "./dashboardSalonQuerySync";

describe("nextDashboardSalonQueryId", () => {
  const allowed = [1, 2, 3, 4, 5];

  it("scrive la sede header quando l’URL manca (ritorno da Report)", () => {
    expect(nextDashboardSalonQueryId(3, null, allowed)).toBe("3");
  });

  it("corregge URL Magazzino Centrale se header è Castrovillari", () => {
    expect(nextDashboardSalonQueryId(3, "5", allowed)).toBe("3");
  });

  it("non riscrive se già allineato", () => {
    expect(nextDashboardSalonQueryId(3, "3", allowed)).toBeNull();
  });

  it("ignora active assente o non consentito", () => {
    expect(nextDashboardSalonQueryId(null, "1", allowed)).toBeNull();
    expect(nextDashboardSalonQueryId(9, "1", allowed)).toBeNull();
  });
});
