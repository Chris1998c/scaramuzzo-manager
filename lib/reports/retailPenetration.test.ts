import { describe, expect, it } from "vitest";

import {
  computeRetailPenetration,
  formatRetailPenetrationPct,
} from "@/lib/reports/retailPenetration";

describe("retailPenetration", () => {
  it("calcola % clienti con retail", () => {
    const stats = computeRetailPenetration(10, 4);
    expect(stats.customers_served).toBe(10);
    expect(stats.customers_with_retail).toBe(4);
    expect(stats.customers_without_retail).toBe(6);
    expect(stats.retail_penetration_pct).toBe(40);
  });

  it("ritorna null con zero clienti serviti", () => {
    expect(computeRetailPenetration(0, 0).retail_penetration_pct).toBeNull();
  });

  it("formatta percentuale o trattino", () => {
    expect(formatRetailPenetrationPct(33.3)).toBe("33.3%");
    expect(formatRetailPenetrationPct(null)).toBe("—");
  });
});
