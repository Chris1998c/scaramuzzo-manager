import { describe, expect, it } from "vitest";
import {
  buildDirectionAlerts,
  CRM_CATEGORY_LABELS,
  pickCrmActionQueue,
} from "@/lib/reports/getDirectionAlerts";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import type { DirectionCrmActions } from "@/lib/reports/getDirectionCrmActions";

function staffRow(discountPct: number): StaffKpiRow {
  return {
    staff_id: 1,
    staff_name: "Anna",
    customers_served: 3,
    services_qty: 4,
    products_qty: 0,
    receipts_count: 3,
    gross: {
      real: 100,
      full: 120,
      discount: 20,
      discount_pct: discountPct,
      avg_ticket_real: 33,
      avg_ticket_full: 40,
      retail: 0,
    },
    net: {
      real: 82,
      full: 98,
      discount: 16,
      discount_pct: discountPct,
      avg_ticket_real: 27,
      avg_ticket_full: 33,
      retail: 0,
    },
  };
}

const emptyCrm: DirectionCrmActions = {
  notReturned60: [],
  notReturned90: [],
  topSpenders: [],
  noShowCustomers: [],
  noRetailBuyers: [],
};

describe("buildDirectionAlerts", () => {
  it("prioritizes high discount staff", () => {
    const alerts = buildDirectionAlerts({
      staffToday: [staffRow(20)],
      noShowToday: 0,
      noShowWeek: 0,
      crm: emptyCrm,
      salonId: 1,
    });
    expect(alerts.some((a) => a.id === "staff-discount")).toBe(true);
    expect(alerts[0]?.href).toContain("tab=team");
  });

  it("caps at 5 alerts", () => {
    const crm: DirectionCrmActions = {
      ...emptyCrm,
      notReturned60: Array.from({ length: 10 }, (_, i) => ({
        customer_id: String(i),
        customer_name: `C${i}`,
        detail: "60 gg",
        gross_total: 0,
        phone: null,
        whatsapp_ready: false,
      })),
      noRetailBuyers: Array.from({ length: 10 }, (_, i) => ({
        customer_id: `nr${i}`,
        customer_name: `NR${i}`,
        detail: "no retail",
        gross_total: 0,
        phone: null,
        whatsapp_ready: false,
      })),
    };
    const alerts = buildDirectionAlerts({
      staffToday: [staffRow(20), staffRow(18)],
      noShowToday: 2,
      noShowWeek: 5,
      crm,
      salonId: 2,
    });
    expect(alerts.length).toBeLessThanOrEqual(5);
  });
});

describe("pickCrmActionQueue", () => {
  it("returns max 5 with Italian category labels", () => {
    const crm: DirectionCrmActions = {
      notReturned60: [
        {
          customer_id: "a",
          customer_name: "Alice",
          detail: "Ultima visita 70 gg fa",
          gross_total: 50,
          phone: "333",
          whatsapp_ready: true,
        },
      ],
      notReturned90: [],
      topSpenders: [
        {
          customer_id: "b",
          customer_name: "Bob",
          detail: "Spesa €500",
          gross_total: 500,
          phone: null,
          whatsapp_ready: false,
        },
      ],
      noShowCustomers: [],
      noRetailBuyers: [],
    };
    const queue = pickCrmActionQueue(crm, 5);
    expect(queue.length).toBeLessThanOrEqual(5);
    expect(CRM_CATEGORY_LABELS[queue[0]!.category]).toBe("Da richiamare");
  });
});
