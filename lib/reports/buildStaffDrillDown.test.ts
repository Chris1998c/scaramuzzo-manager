import { describe, expect, it } from "vitest";

import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { buildStaffDrillDown } from "@/lib/reports/buildStaffDrillDown";
import type { ReportRow } from "@/lib/reports/getSalonTurnover";

const baseStaff: StaffKpiRow = {
  staff_id: 7,
  staff_name: "Maria",
  customers_served: 2,
  customers_with_retail: 1,
  customers_without_retail: 1,
  retail_penetration_pct: 50,
  services_qty: 2,
  products_qty: 1,
  receipts_count: 2,
  discounted_receipts_count: 1,
  receipts_without_customer: 0,
  gross: {
    real: 200,
    full: 220,
    discount: 20,
    discount_pct: 9.1,
    avg_ticket_real: 100,
    avg_ticket_full: 110,
    retail: 30,
  },
  net: {
    real: 160,
    full: 176,
    discount: 16,
    discount_pct: 9.1,
    avg_ticket_real: 80,
    avg_ticket_full: 88,
    retail: 24,
  },
};

describe("buildStaffDrillDown", () => {
  it("deriva top servizi/prodotti e clienti dal dettaglio righe", () => {
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
      {
        sale_item_id: 2,
        id: 2,
        sale_id: 11,
        sale_day: "2026-05-21",
        item_type: "product",
        product_name: "Shampoo",
        service_name: null,
        quantity: 1,
        price: 30,
        line_total_gross: 30,
        line_net: 24,
        line_vat: 6,
        item_discount: 0,
        staff_id: 7,
        staff_name: "Maria",
        payment_method: "card",
      },
    ];

    const drill = buildStaffDrillDown({
      staffId: 7,
      rows,
      customerBySaleId: { "10": "c1", "11": "c2" },
      current: baseStaff,
      previous: { ...baseStaff, gross: { ...baseStaff.gross, real: 100 } },
    });

    expect(drill.topServices[0]?.name).toBe("Taglio");
    expect(drill.topProducts[0]?.name).toBe("Shampoo");
    expect(drill.recentCustomers).toHaveLength(2);
    expect(drill.customersWithoutRetail.map((c) => c.customer_id)).toContain("c1");
    expect(drill.periodComparison?.delta_pct).toBe(100);
  });
});
