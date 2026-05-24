import { describe, expect, it } from "vitest";

import {
  canCustomerCancelBooking,
  isAppointmentStartInFuture,
} from "./canCustomerCancelBooking";
import { parseCustomerAppBookingId } from "./parseCustomerAppBookingId";

const FUTURE_START = "2099-06-15T10:00:00";
const PAST_START = "2000-01-01T10:00:00";

describe("parseCustomerAppBookingId", () => {
  it("accetta id intero positivo", () => {
    expect(parseCustomerAppBookingId("123")).toBe(123);
    expect(parseCustomerAppBookingId(42)).toBe(42);
  });

  it("rifiuta id invalido", () => {
    expect(parseCustomerAppBookingId("")).toBeNull();
    expect(parseCustomerAppBookingId("abc")).toBeNull();
    expect(parseCustomerAppBookingId("0")).toBeNull();
    expect(parseCustomerAppBookingId("-1")).toBeNull();
  });
});

describe("canCustomerCancelBooking", () => {
  it("consente scheduled customer_app futuro senza vendita", () => {
    const r = canCustomerCancelBooking({
      status: "scheduled",
      sale_id: null,
      source: "customer_app",
      start_time: FUTURE_START,
      nowMs: Date.parse("2026-01-01T12:00:00"),
    });
    expect(r).toEqual({ allowed: true });
  });

  it("consente anche source booking (agenda staff)", () => {
    const r = canCustomerCancelBooking({
      status: "scheduled",
      sale_id: null,
      source: "booking",
      start_time: FUTURE_START,
      nowMs: Date.parse("2026-01-01T12:00:00"),
    });
    expect(r.allowed).toBe(true);
  });

  it("blocca con sale_id", () => {
    const r = canCustomerCancelBooking({
      status: "scheduled",
      sale_id: 99,
      source: "customer_app",
      start_time: FUTURE_START,
      nowMs: Date.parse("2026-01-01T12:00:00"),
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toMatch(/vendita/i);
    }
  });

  it("blocca stati terminali e in_sala", () => {
    for (const status of ["done", "cancelled", "no_show", "in_sala"] as const) {
      const r = canCustomerCancelBooking({
        status,
        sale_id: null,
        source: "customer_app",
        start_time: FUTURE_START,
        nowMs: Date.parse("2026-01-01T12:00:00"),
      });
      expect(r.allowed).toBe(false);
    }
  });

  it("blocca appuntamento passato", () => {
    const r = canCustomerCancelBooking({
      status: "scheduled",
      sale_id: null,
      source: "customer_app",
      start_time: PAST_START,
      nowMs: Date.parse("2026-01-01T12:00:00"),
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toMatch(/passato|iniziato/i);
    }
  });

  it("blocca walk_in", () => {
    const r = canCustomerCancelBooking({
      status: "scheduled",
      sale_id: null,
      source: "walk_in",
      start_time: FUTURE_START,
      nowMs: Date.parse("2026-01-01T12:00:00"),
    });
    expect(r.allowed).toBe(false);
  });
});

describe("isAppointmentStartInFuture", () => {
  it("confronta con slot agenda", () => {
    expect(
      isAppointmentStartInFuture(
        "2099-01-01T10:00:00",
        Date.parse("2026-01-01T08:00:00"),
      ),
    ).toBe(true);
    expect(
      isAppointmentStartInFuture(
        "2020-01-01T10:00:00",
        Date.parse("2026-01-01T08:00:00"),
      ),
    ).toBe(false);
  });
});
