import { describe, expect, it } from "vitest";

import { MAX_CUSTOMER_APP_BOOKINGS_LIMIT } from "./customerAppLimits";
import { parseCustomerAppBookingsQuery } from "./parseCustomerAppBookingsQuery";

function url(query: string) {
  return new URL(`https://x/api/customer/v1/bookings?${query}`);
}

describe("parseCustomerAppBookingsQuery", () => {
  it("accetta query vuota con default limit", () => {
    const r = parseCustomerAppBookingsQuery(new URL("https://x/api/customer/v1/bookings"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.salonId).toBeNull();
      expect(r.data.status).toBeNull();
      expect(r.data.from).toBeNull();
      expect(r.data.to).toBeNull();
      expect(r.data.limit).toBe(50);
    }
  });

  it("accetta filtri validi", () => {
    const r = parseCustomerAppBookingsQuery(
      url("salon_id=1&status=scheduled&from=2026-01-01&to=2026-12-31&limit=20"),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.salonId).toBe(1);
      expect(r.data.status).toBe("scheduled");
      expect(r.data.from).toBe("2026-01-01");
      expect(r.data.to).toBe("2026-12-31");
      expect(r.data.limit).toBe(20);
    }
  });

  it("rifiuta salon_id invalido", () => {
    const r = parseCustomerAppBookingsQuery(url("salon_id=5"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/salon_id/i);
    }
  });

  it("rifiuta from/to invalido", () => {
    expect(parseCustomerAppBookingsQuery(url("from=bad")).ok).toBe(false);
    expect(parseCustomerAppBookingsQuery(url("to=2026-99-99")).ok).toBe(false);
  });

  it("rifiuta from successivo a to", () => {
    const r = parseCustomerAppBookingsQuery(url("from=2026-06-01&to=2026-05-01"));
    expect(r.ok).toBe(false);
  });

  it("rifiuta limit oltre il massimo", () => {
    const r = parseCustomerAppBookingsQuery(url(`limit=${MAX_CUSTOMER_APP_BOOKINGS_LIMIT + 1}`));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain(String(MAX_CUSTOMER_APP_BOOKINGS_LIMIT));
    }
  });

  it("rifiuta status invalido", () => {
    const r = parseCustomerAppBookingsQuery(url("status=unknown"));
    expect(r.ok).toBe(false);
  });

  it("accetta tutti gli status agenda noti", () => {
    for (const status of ["scheduled", "in_sala", "done", "cancelled", "no_show", "noshow"]) {
      const r = parseCustomerAppBookingsQuery(url(`status=${status}`));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.status).toBe(status);
    }
  });
});
