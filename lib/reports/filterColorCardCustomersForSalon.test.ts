import { describe, expect, it } from "vitest";

import { filterColorCardCustomerIds } from "@/lib/reports/filterColorCardCustomersForSalon";

describe("filterColorCardCustomerIds", () => {
  it("include card salon-specific sempre", () => {
    const eligible = filterColorCardCustomerIds({
      cards: [{ customer_id: "c1", salon_id: 2 }],
      salonId: 2,
      customersActiveInSalon: new Set(),
    });
    expect(eligible.has("c1")).toBe(true);
  });

  it("esclude card globale se cliente attivo solo in altro salone", () => {
    const eligible = filterColorCardCustomerIds({
      cards: [{ customer_id: "c-global", salon_id: null }],
      salonId: 2,
      customersActiveInSalon: new Set(),
    });
    expect(eligible.has("c-global")).toBe(false);
  });

  it("include card globale se cliente ha attività nel salone", () => {
    const eligible = filterColorCardCustomerIds({
      cards: [{ customer_id: "c-global", salon_id: null }],
      salonId: 2,
      customersActiveInSalon: new Set(["c-global"]),
    });
    expect(eligible.has("c-global")).toBe(true);
  });

  it("esclude card di altro salone specifico", () => {
    const eligible = filterColorCardCustomerIds({
      cards: [{ customer_id: "c-other", salon_id: 9 }],
      salonId: 2,
      customersActiveInSalon: new Set(["c-other"]),
    });
    expect(eligible.has("c-other")).toBe(false);
  });
});
