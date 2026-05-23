import { describe, expect, it } from "vitest";

import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { flattenStaffKpiRow } from "@/lib/reports/flattenStaffKpiForExport";

const sample: StaffKpiRow = {
  staff_id: 1,
  staff_name: "Giulia",
  customers_served: 3,
  customers_with_retail: 2,
  customers_without_retail: 1,
  retail_penetration_pct: 66.7,
  services_qty: 5,
  products_qty: 2,
  receipts_count: 3,
  discounted_receipts_count: 1,
  receipts_without_customer: 0,
  gross: {
    real: 100,
    full: 110,
    discount: 10,
    discount_pct: 9.09,
    avg_ticket_real: 33.33,
    avg_ticket_full: 36.67,
    retail: 20,
  },
  net: {
    real: 81.97,
    full: 90.16,
    discount: 8.2,
    discount_pct: 9.09,
    avg_ticket_real: 27.32,
    avg_ticket_full: 30.05,
    retail: 16.39,
  },
};

describe("flattenStaffKpiForExport", () => {
  it("espone campi piatti senza nested gross/net", () => {
    const flat = flattenStaffKpiRow(sample);
    expect(flat.incassato_lordo).toBe(100);
    expect(flat.sconto_pct).toBe(9.09);
    expect(flat.incassato_imponibile).toBe(81.97);
    expect(flat).not.toHaveProperty("gross");
    expect(flat).not.toHaveProperty("net");
  });
});
