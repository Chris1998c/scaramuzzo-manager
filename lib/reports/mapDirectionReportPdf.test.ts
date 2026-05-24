import { describe, expect, it } from "vitest";

import type { DirectionReport } from "@/lib/reports/getDirectionReport";
import { mapDirectionReportToPdfPayload } from "@/lib/reports/mapDirectionReportPdf";

const baseReport = {
  today: {
    dateFrom: "2026-05-23",
    dateTo: "2026-05-23",
    receipts_count: 5,
    customers_count: 4,
    services_qty: 6,
    products_qty: 2,
    money: {
      gross: { real: 500, full: 550, discount: 50 },
      net: { real: 410, full: 451, discount: 41 },
    },
    avg_ticket_gross: 100,
    avg_ticket_net: 82,
  },
  month: {
    dateFrom: "2026-05-01",
    dateTo: "2026-05-23",
    receipts_count: 80,
    customers_count: 40,
    services_qty: 90,
    products_qty: 20,
    money: {
      gross: { real: 12000, full: 13000, discount: 1000 },
      net: { real: 9800, full: 10600, discount: 800 },
    },
    avg_ticket_gross: 150,
    avg_ticket_net: 122,
  },
  monthComparison: { gross_real_pct: 10, net_real_pct: 8, receipts_pct: 5 },
  vsYesterday: { amount_gross: 400, amount_net: 328, pct_gross: 25, pct_net: 25 },
  vsLastWeekSameDay: {
    amount_gross: 450,
    amount_net: 369,
    pct_gross: 11.1,
    pct_net: 11.1,
  },
  crm: {
    notReturned60: [{ customer_id: "1", customer_name: "A", detail: "x" }],
    notReturned90: [],
    topSpenders: [],
    noShowCustomers: [],
    noRetailBuyers: [],
    colorAbsent: [{ customer_id: "2", customer_name: "B", detail: "y", phone: null, last_color_label: "1/1", days_absent: 50, threshold_days: 45 }],
  },
  crmActions: [],
  alerts: [{ id: "a", title: "Test", count: 1, detail: "d", href: "/", severity: "info" as const }],
  staffToday: [
    {
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
    },
  ],
} satisfies DirectionReport;

describe("mapDirectionReportPdf", () => {
  it("mappa KPI direzionali per PDF", () => {
    const payload = mapDirectionReportToPdfPayload(baseReport, "Salone Test");
    expect(payload.salonName).toBe("Salone Test");
    expect(payload.incassoOggi).toBe(500);
    expect(payload.topStaff).toHaveLength(1);
    expect(payload.recallCount).toBe(1);
    expect(payload.colorAbsentCount).toBe(1);
    expect(payload.alerts).toHaveLength(1);
    expect(payload.recallClients).toHaveLength(1);
    expect(payload.meseCorrente).toBe(12000);
    expect(payload.crmActions).toEqual([]);
  });
});
