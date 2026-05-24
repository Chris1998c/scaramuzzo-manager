import { describe, expect, it } from "vitest";
import {
  buildDirectionAlerts,
  pickCrmActionQueue,
} from "@/lib/reports/getDirectionAlerts";
import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import type { DirectionCrmActions } from "@/lib/reports/getDirectionCrmActions";

function staffRow(discountPct: number): StaffKpiRow {
  return {
    staff_id: 1,
    staff_name: "Anna",
    customers_served: 3,
    customers_with_retail: 0,
    customers_without_retail: 3,
    retail_penetration_pct: 0,
    services_qty: 4,
    products_qty: 0,
    receipts_count: 3,
    discounted_receipts_count: 0,
    receipts_without_customer: 0,
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
  colorAbsent: [],
};

function alertInput(
  partial: Partial<Parameters<typeof buildDirectionAlerts>[0]> = {},
): Parameters<typeof buildDirectionAlerts>[0] {
  return {
    staffToday: [],
    noShowToday: 0,
    noShowWeek: 0,
    appointmentsToday: 0,
    crm: emptyCrm,
    salonId: 1,
    todayDiscountPct: 0,
    todayRetailPenetrationPct: null,
    openCashHours: null,
    lowStockCount: 0,
    colorAbsentCount: 0,
    ...partial,
  };
}

describe("buildDirectionAlerts", () => {
  it("prioritizes high discount staff", () => {
    const alerts = buildDirectionAlerts(
      alertInput({ staffToday: [staffRow(20)] }),
    );
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
    const alerts = buildDirectionAlerts(
      alertInput({
        staffToday: [staffRow(20), staffRow(18)],
        noShowToday: 2,
        noShowWeek: 5,
        crm,
        salonId: 2,
      }),
    );
    expect(alerts.length).toBeLessThanOrEqual(5);
  });

  it("prioritizza cassa aperta e colore assenti", () => {
    const alerts = buildDirectionAlerts(
      alertInput({
        openCashHours: 10,
        colorAbsentCount: 5,
      }),
    );
    expect(alerts.some((a) => a.id === "cash-open")).toBe(true);
    expect(alerts.some((a) => a.id === "color-absent")).toBe(true);
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
      colorAbsent: [],
    };
    const queue = pickCrmActionQueue(crm, 5);
    expect(queue.length).toBeLessThanOrEqual(5);
    expect(queue[0]!.reason).toBe("Da richiamare (60+ gg)");
    expect(queue[0]!.extra_reasons_count).toBe(0);
  });

  it("deduplica per customer_id e applica priorità segmenti", () => {
    const crm: DirectionCrmActions = {
      colorAbsent: [
        {
          customer_id: "x",
          customer_name: "Chiara",
          phone: "333",
          last_color_label: "1/1",
          days_absent: 50,
          threshold_days: 45,
          detail: "Colore assente",
        },
      ],
      notReturned60: [
        {
          customer_id: "x",
          customer_name: "Chiara",
          detail: "60 gg",
          phone: "333",
          whatsapp_ready: true,
        },
      ],
      notReturned90: [
        {
          customer_id: "y",
          customer_name: "Yuri",
          detail: "90 gg",
          phone: null,
          whatsapp_ready: false,
        },
      ],
      noShowCustomers: [
        {
          customer_id: "x",
          customer_name: "Chiara",
          detail: "No-show",
          phone: "333",
          whatsapp_ready: true,
        },
      ],
      noRetailBuyers: [],
      topSpenders: [],
    };
    const queue = pickCrmActionQueue(crm, 5);
    expect(queue).toHaveLength(2);
    expect(queue[0]!.customer_id).toBe("x");
    expect(queue[0]!.reason).toBe("Colore assente");
    expect(queue[0]!.extra_reasons_count).toBe(2);
    expect(queue[1]!.customer_id).toBe("y");
    expect(queue[1]!.reason).toBe("Da richiamare (90+ gg)");
  });

  it("preferisce recall 90 su recall 60 per lo stesso cliente", () => {
    const crm: DirectionCrmActions = {
      notReturned60: [
        {
          customer_id: "z",
          customer_name: "Zoe",
          detail: "60",
          phone: null,
          whatsapp_ready: false,
        },
      ],
      notReturned90: [
        {
          customer_id: "z",
          customer_name: "Zoe",
          detail: "90",
          phone: null,
          whatsapp_ready: false,
        },
      ],
      topSpenders: [],
      noShowCustomers: [],
      noRetailBuyers: [],
      colorAbsent: [],
    };
    const queue = pickCrmActionQueue(crm, 5);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.reason).toBe("Da richiamare (90+ gg)");
    expect(queue[0]!.extra_reasons_count).toBe(1);
  });
});
