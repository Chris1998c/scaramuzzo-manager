import { describe, expect, it } from "vitest";

import { collectTimelineCatalogIds } from "@/lib/reports/collectTimelineCatalogIds";

describe("collectTimelineCatalogIds", () => {
  it("raccoglie solo ID presenti nelle righe, senza duplicati", () => {
    const ids = collectTimelineCatalogIds([
      { service_id: 10, product_id: null },
      { service_id: 10, product_id: "p2" },
      { service_id: null, product_id: "p1" },
      { service_id: "", product_id: undefined },
    ]);
    expect(ids.serviceIds).toEqual(["10"]);
    expect(ids.productIds.sort()).toEqual(["p1", "p2"]);
  });

  it("restituisce array vuoti senza righe", () => {
    expect(collectTimelineCatalogIds([])).toEqual({ serviceIds: [], productIds: [] });
  });
});
