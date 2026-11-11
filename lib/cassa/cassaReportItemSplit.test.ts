import { describe, expect, it } from "vitest";

import {
  splitCassaReportItemGross,
  splitCassaReportItemGrossLegacyNoGlobal,
} from "@/lib/cassa/cassaReportItemSplit";

describe("splitCassaReportItemGross", () => {
  it("con sconto globale services+products = total_amount", () => {
    const sales = [{ id: 1, total_amount: 80 }];
    const items = [
      { sale_id: 1, service_id: 1, product_id: null, quantity: 1, price: 60, discount: 0 },
      { sale_id: 1, service_id: null, product_id: 2, quantity: 1, price: 40, discount: 0 },
    ];
    const legacy = splitCassaReportItemGrossLegacyNoGlobal({ items });
    expect(legacy.services_gross + legacy.products_gross).toBe(100);

    const fixed = splitCassaReportItemGross({ sales, items });
    expect(fixed.allocated_gross).toBe(80);
    expect(fixed.services_gross + fixed.products_gross).toBe(80);
  });

  it("senza sconto globale lascia invariati i totali riga", () => {
    const sales = [{ id: 1, total_amount: 50 }];
    const items = [
      { sale_id: 1, service_id: 1, product_id: null, quantity: 1, price: 50, discount: 0 },
    ];
    const fixed = splitCassaReportItemGross({ sales, items });
    expect(fixed.services_gross).toBe(50);
    expect(fixed.products_gross).toBe(0);
  });
});
