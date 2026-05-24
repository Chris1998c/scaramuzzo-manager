import { describe, expect, it } from "vitest";

import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { mapStaffReportToPdfPayload } from "@/lib/reports/mapStaffReportPdf";

const staffRow: StaffKpiRow = {
  staff_id: 1,
  staff_name: "Giulia",
  customers_served: 3,
  customers_with_retail: 1,
  customers_without_retail: 2,
  retail_penetration_pct: 33.3,
  services_qty: 4,
  products_qty: 1,
  receipts_count: 3,
  discounted_receipts_count: 1,
  receipts_without_customer: 0,
  gross: {
    real: 300,
    full: 330,
    discount: 30,
    discount_pct: 9,
    avg_ticket_real: 100,
    avg_ticket_full: 110,
    retail: 40,
  },
  net: {
    real: 246,
    full: 270,
    discount: 24,
    discount_pct: 9,
    avg_ticket_real: 82,
    avg_ticket_full: 90,
    retail: 33,
  },
};

describe("mapStaffReportToPdfPayload", () => {
  it("mappa summary e blocchi collaboratore per PDF team", () => {
    const payload = mapStaffReportToPdfPayload({
      salonName: "Salone Test",
      salonId: 1,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-23",
      staffPerformance: [staffRow],
      rows: [
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
          staff_id: 1,
          staff_name: "Giulia",
          payment_method: "cash",
        },
      ],
      customerBySaleId: { "10": "c1" },
    });

    expect(payload.summary.incasso).toBe(300);
    expect(payload.staff).toHaveLength(1);
    expect(payload.staff[0].topServices[0]?.name).toBe("Taglio");
  });
});
