import { describe, expect, it, vi } from "vitest";

import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { buildStaffDrillDownPayloadServer } from "@/lib/reports/buildStaffDrillDownPayloadServer";
import type { ReportRow } from "@/lib/reports/getSalonTurnover";

vi.mock("@/lib/reports/loadCustomersByIds", () => ({
  loadCustomersByIds: vi.fn(async (ids: string[]) => {
    const map = new Map<string, { first_name?: string; last_name?: string }>();
    if (ids.includes("c1")) map.set("c1", { first_name: "Anna", last_name: "Verdi" });
    return map;
  }),
}));

const staff: StaffKpiRow = {
  staff_id: 7,
  staff_name: "Maria",
  customers_served: 1,
  customers_with_retail: 0,
  customers_without_retail: 1,
  retail_penetration_pct: 0,
  services_qty: 1,
  products_qty: 0,
  receipts_count: 1,
  discounted_receipts_count: 0,
  receipts_without_customer: 0,
  gross: {
    real: 50,
    full: 50,
    discount: 0,
    discount_pct: 0,
    avg_ticket_real: 50,
    avg_ticket_full: 50,
    retail: 0,
  },
  net: {
    real: 40,
    full: 40,
    discount: 0,
    discount_pct: 0,
    avg_ticket_real: 40,
    avg_ticket_full: 40,
    retail: 0,
  },
};

const rows: ReportRow[] = [
  {
    sale_item_id: 1,
    id: 1,
    sale_id: 10,
    sale_day: "2026-05-20",
    item_type: "service",
    product_name: null,
    service_name: "Taglio",
    quantity: 1,
    price: 50,
    line_total_gross: 50,
    line_net: 40,
    line_vat: 10,
    item_discount: 0,
    staff_id: 7,
    staff_name: "Maria",
    payment_method: "cash",
  },
];

describe("buildStaffDrillDownPayloadServer", () => {
  it("arricchisce drill-down con nomi cliente batch", async () => {
    const map = await buildStaffDrillDownPayloadServer({
      rows,
      staffPerformance: [staff],
      previousStaffPerformance: [],
      customerBySaleId: { "10": "c1" },
    });

    const drill = map["7"];
    expect(drill?.recentCustomers[0]?.customer_name).toBe("Anna Verdi");
    expect(drill?.customersWithoutRetail[0]?.customer_name).toBe("Anna Verdi");
  });
});
