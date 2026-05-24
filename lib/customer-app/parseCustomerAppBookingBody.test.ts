import { describe, expect, it } from "vitest";

import { MAX_CUSTOMER_APP_SERVICE_IDS } from "./customerAppLimits";
import {
  parseBookingServiceIds,
  parseCustomerAppBookingBody,
} from "./parseCustomerAppBookingBody";

describe("parseBookingServiceIds", () => {
  it("accetta fino a 10 servizi", () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(parseBookingServiceIds(ids)).toEqual({ ok: true, ids });
  });

  it("rifiuta più di 10 servizi", () => {
    const ids = Array.from({ length: 11 }, (_, i) => i + 1);
    const r = parseBookingServiceIds(ids);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain(String(MAX_CUSTOMER_APP_SERVICE_IDS));
    }
  });
});

describe("parseCustomerAppBookingBody", () => {
  it("rifiuta notes troppo lunghe", () => {
    const r = parseCustomerAppBookingBody({
      salon_id: 1,
      service_ids: [1],
      staff_id: 2,
      start_time: "2099-12-31T10:00:00",
      notes: "x".repeat(501),
    });
    expect(r.ok).toBe(false);
  });

  it("rifiuta start_time nel passato", () => {
    const r = parseCustomerAppBookingBody({
      salon_id: 1,
      service_ids: [1],
      staff_id: 2,
      start_time: "2000-01-01T10:00:00",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/passato/i);
    }
  });

  it("accetta body valido", () => {
    const r = parseCustomerAppBookingBody({
      salon_id: 1,
      service_ids: [12, 15],
      staff_id: 3,
      start_time: "2099-06-15T10:00:00",
      notes: " test ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.salonId).toBe(1);
      expect(r.data.serviceIds).toEqual([12, 15]);
      expect(r.data.staffId).toBe(3);
      expect(r.data.notes).toBe("test");
    }
  });
});
