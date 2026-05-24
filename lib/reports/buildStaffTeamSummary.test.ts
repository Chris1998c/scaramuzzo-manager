import { describe, expect, it } from "vitest";

import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { buildStaffTeamSummary } from "@/lib/reports/buildStaffTeamSummary";

function staff(partial: Partial<StaffKpiRow> & Pick<StaffKpiRow, "staff_id">): StaffKpiRow {
  return {
    staff_name: `Staff ${partial.staff_id}`,
    customers_served: 4,
    customers_with_retail: 2,
    customers_without_retail: 2,
    retail_penetration_pct: 50,
    services_qty: 6,
    products_qty: 2,
    receipts_count: 5,
    discounted_receipts_count: 1,
    receipts_without_customer: 0,
    gross: {
      real: 500,
      full: 600,
      discount: 100,
      discount_pct: 16.7,
      avg_ticket_real: 100,
      avg_ticket_full: 120,
      retail: 80,
    },
    net: {
      real: 400,
      full: 480,
      discount: 80,
      discount_pct: 16.7,
      avg_ticket_real: 80,
      avg_ticket_full: 96,
      retail: 64,
    },
    ...partial,
  };
}

describe("buildStaffTeamSummary", () => {
  it("aggrega KPI team e individua highlight", () => {
    const summary = buildStaffTeamSummary([
      staff({ staff_id: 1, gross: { ...staff({ staff_id: 1 }).gross, real: 900, discount_pct: 8 } }),
      staff({
        staff_id: 2,
        gross: { ...staff({ staff_id: 2 }).gross, real: 400, discount_pct: 22 },
        retail_penetration_pct: 10,
      }),
    ]);

    expect(summary.incasso).toBe(1300);
    expect(summary.staff_count).toBe(2);
    expect(summary.best_performer?.staff_id).toBe(1);
    expect(summary.highest_discount?.staff_id).toBe(2);
    expect(summary.lowest_retail?.staff_id).toBe(2);
  });
});
