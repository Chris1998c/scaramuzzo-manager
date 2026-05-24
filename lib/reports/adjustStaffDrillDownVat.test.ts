import { describe, expect, it } from "vitest";

import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import type { StaffDrillDownData } from "@/lib/reports/buildStaffDrillDown";
import { adjustStaffDrillDownVat } from "@/lib/reports/adjustStaffDrillDownVat";

const staff: StaffKpiRow = {
  staff_id: 1,
  staff_name: "A",
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
    real: 100,
    full: 110,
    discount: 10,
    discount_pct: 9,
    avg_ticket_real: 100,
    avg_ticket_full: 110,
    retail: 0,
  },
  net: {
    real: 80,
    full: 88,
    discount: 8,
    discount_pct: 9,
    avg_ticket_real: 80,
    avg_ticket_full: 88,
    retail: 0,
  },
};

const drill: StaffDrillDownData = {
  topServices: [{ name: "Taglio", quantity: 1, gross: 100, net: 80 }],
  topProducts: [],
  recentCustomers: [
    {
      customer_id: "c1",
      last_day: "2026-05-01",
      gross: 100,
      net: 80,
      visits: 1,
    },
  ],
  customersWithoutRetail: [],
  discountedReceipts: 0,
  totalReceipts: 1,
  dailyTrend: [{ day: "2026-05-01", gross: 100, net: 80, receipts: 1 }],
  periodComparison: {
    previous_incassato: 50,
    current_incassato: 100,
    delta_pct: 100,
  },
  retailSold: 0,
  servicesQty: 1,
  productsQty: 0,
  receiptsWithoutCustomer: 0,
};

describe("adjustStaffDrillDownVat", () => {
  it("applica imponibile a top servizi, clienti e trend", () => {
    const adjusted = adjustStaffDrillDownVat(drill, staff, undefined, "net");
    expect(adjusted.topServices[0]?.gross).toBe(80);
    expect(adjusted.recentCustomers[0]?.gross).toBe(80);
    expect(adjusted.dailyTrend[0]?.gross).toBe(80);
    expect(adjusted.periodComparison?.current_incassato).toBe(80);
  });
});
