import { describe, expect, it } from "vitest";

import {
  hashCustomerBookingPayload,
  MAX_CUSTOMER_BOOKING_IDEMPOTENCY_KEY_LENGTH,
  parseCustomerBookingIdempotencyKey,
} from "./customerBookingIdempotency";
import type { ParsedCustomerAppBookingBody } from "./parseCustomerAppBookingBody";

const samplePayload: ParsedCustomerAppBookingBody = {
  salonId: 1,
  serviceIds: [12, 15],
  staffId: 3,
  startTime: "2099-06-15T10:00:00",
  notes: "test",
};

describe("parseCustomerBookingIdempotencyKey", () => {
  it("accetta assenza header", () => {
    expect(parseCustomerBookingIdempotencyKey(null)).toEqual({ ok: true, key: null });
  });

  it("accetta chiave valida", () => {
    const r = parseCustomerBookingIdempotencyKey("  my-key-123  ");
    expect(r).toEqual({ ok: true, key: "my-key-123" });
  });

  it("rifiuta chiave vuota", () => {
    expect(parseCustomerBookingIdempotencyKey("   ").ok).toBe(false);
  });

  it("rifiuta chiave troppo lunga", () => {
    const r = parseCustomerBookingIdempotencyKey("x".repeat(MAX_CUSTOMER_BOOKING_IDEMPOTENCY_KEY_LENGTH + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain(String(MAX_CUSTOMER_BOOKING_IDEMPOTENCY_KEY_LENGTH));
    }
  });
});

describe("hashCustomerBookingPayload", () => {
  it("è stabile per stesso payload", () => {
    const a = hashCustomerBookingPayload(samplePayload);
    const b = hashCustomerBookingPayload({ ...samplePayload });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("cambia con ordine service_ids", () => {
    const a = hashCustomerBookingPayload(samplePayload);
    const b = hashCustomerBookingPayload({
      ...samplePayload,
      serviceIds: [15, 12],
    });
    expect(a).not.toBe(b);
  });

  it("cambia con start_time diverso", () => {
    const a = hashCustomerBookingPayload(samplePayload);
    const b = hashCustomerBookingPayload({
      ...samplePayload,
      startTime: "2099-06-15T10:15:00",
    });
    expect(a).not.toBe(b);
  });
});
