import { describe, expect, it } from "vitest";

import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import {
  computeStaffAlertBadges,
  computeTeamAvgTicket,
  HIGH_DISCOUNT_PCT,
  STAFF_ALERT_BADGE_META,
} from "@/lib/reports/staffKpiAlerts";

function row(partial: Partial<StaffKpiRow> & Pick<StaffKpiRow, "staff_id">): StaffKpiRow {
  return {
    staff_id: partial.staff_id,
    staff_name: partial.staff_name ?? "Test",
    customers_served: partial.customers_served ?? 5,
    customers_with_retail: partial.customers_with_retail ?? 0,
    customers_without_retail: partial.customers_without_retail ?? 5,
    retail_penetration_pct: partial.retail_penetration_pct ?? 0,
    services_qty: partial.services_qty ?? 6,
    products_qty: partial.products_qty ?? 0,
    receipts_count: partial.receipts_count ?? 5,
    discounted_receipts_count: partial.discounted_receipts_count ?? 0,
    receipts_without_customer: partial.receipts_without_customer ?? 0,
    gross: partial.gross ?? {
      real: 500,
      full: 600,
      discount: 100,
      discount_pct: 16.7,
      avg_ticket_real: 100,
      avg_ticket_full: 120,
      retail: 0,
    },
    net: partial.net ?? {
      real: 410,
      full: 492,
      discount: 82,
      discount_pct: 16.7,
      avg_ticket_real: 82,
      avg_ticket_full: 98,
      retail: 0,
    },
  };
}

describe("staffKpiAlerts", () => {
  it("computeTeamAvgTicket pondera per scontrini", () => {
    const rows = [
      row({ staff_id: 1, receipts_count: 2, gross: { ...row({ staff_id: 1 }).gross, real: 200 } }),
      row({ staff_id: 2, receipts_count: 8, gross: { ...row({ staff_id: 2 }).gross, real: 800 } }),
    ];
    expect(computeTeamAvgTicket(rows)).toBe(100);
  });

  it("assegna badge sconto alto, retail basso e scontrino basso", () => {
    const lowTicket = row({
      staff_id: 3,
      receipts_count: 5,
      gross: {
        real: 250,
        full: 300,
        discount: 50,
        discount_pct: HIGH_DISCOUNT_PCT,
        avg_ticket_real: 50,
        avg_ticket_full: 60,
        retail: 0,
      },
    });
    const teamAvg = 100;
    const badges = computeStaffAlertBadges(lowTicket, teamAvg);
    expect(badges).toContain("high_discount");
    expect(badges).toContain("low_retail");
    expect(badges).toContain("low_ticket");
    expect(STAFF_ALERT_BADGE_META.high_discount.label).toBe("Sconto alto");
  });
});
