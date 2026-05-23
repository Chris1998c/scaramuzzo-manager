import { describe, expect, it } from "vitest";

import { buildCustomerTimeline } from "@/lib/reports/buildCustomerTimeline";

describe("buildCustomerTimeline", () => {
  it("unisce appuntamenti, spese e righe per data", () => {
    const { entries, total_spent } = buildCustomerTimeline({
      appointments: [
        { id: 1, start_time: "2026-05-20T10:00:00", status: "done", service_label: "Colore" },
        { id: 2, start_time: "2026-05-10T10:00:00", status: "no_show", service_label: "Taglio" },
      ],
      sales: [{ id: 10, date: "2026-05-18T15:00:00", total_amount: 80 }],
      saleItems: [
        {
          id: 100,
          sale_id: 10,
          product_id: "p1",
          quantity: 1,
          price: 25,
          sale_date: "2026-05-18",
          label: "Shampoo",
        },
      ],
    });

    expect(total_spent).toBe(80);
    expect(entries[0]?.date).toBe("2026-05-20");
    expect(entries.some((e) => e.kind === "noshow")).toBe(true);
    expect(entries.some((e) => e.kind === "product")).toBe(true);
  });
});
