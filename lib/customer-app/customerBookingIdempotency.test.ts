import { describe, expect, it, vi } from "vitest";

import type { CustomerAppBookingDto } from "./createCustomerAppBooking";
import {
  beginCustomerBookingIdempotency,
  CUSTOMER_BOOKING_IDEMPOTENCY_GONE_MESSAGE,
  hashCustomerBookingPayload,
  MAX_CUSTOMER_BOOKING_IDEMPOTENCY_KEY_LENGTH,
  parseCustomerBookingIdempotencyKey,
  resolveExistingIdempotencyRow,
  verifyIdempotencyReplayBooking,
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

const sampleBooking = {
  id: 142,
  salon_id: 1,
  start_time: "2099-06-15T10:00:00",
  end_time: "2099-06-15T10:30:00",
  status: "scheduled",
  source: "customer_app",
  notes: null,
  services: [],
} as unknown as CustomerAppBookingDto;

const baseRow = {
  id: "rec-1",
  user_id: "user-1",
  customer_id: "cust-1",
  idempotency_key: "k1",
  request_hash: hashCustomerBookingPayload(samplePayload),
  booking_id: 142,
  response: { booking: sampleBooking },
  status: "success",
  created_at: new Date().toISOString(),
};

describe("resolveExistingIdempotencyRow", () => {
  it("replay success con response booking", () => {
    const r = resolveExistingIdempotencyRow(
      baseRow,
      baseRow.request_hash,
      Date.now(),
    );
    expect(r).toEqual({ action: "replay", booking: sampleBooking });
  });

  it("conflict su hash diverso", () => {
    const r = resolveExistingIdempotencyRow(baseRow, "other-hash", Date.now());
    expect(r.action).toBe("conflict");
  });
});

describe("verifyIdempotencyReplayBooking", () => {
  it("ok se appointment esiste, ownership e status attivo", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 142, customer_id: "cust-1", status: "scheduled" },
      error: null,
    });
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    };
    await expect(
      verifyIdempotencyReplayBooking(admin as never, sampleBooking, "cust-1"),
    ).resolves.toEqual({ ok: true });
  });

  it("fixture #142 assente → fail (mai 201 fantasma)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    };
    await expect(
      verifyIdempotencyReplayBooking(admin as never, sampleBooking, "cust-1"),
    ).resolves.toEqual({ ok: false });
  });

  it("ownership errata o status terminale → fail", async () => {
    const adminWrongOwner = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 142, customer_id: "other", status: "scheduled" },
              error: null,
            }),
          })),
        })),
      })),
    };
    await expect(
      verifyIdempotencyReplayBooking(adminWrongOwner as never, sampleBooking, "cust-1"),
    ).resolves.toEqual({ ok: false });

    const adminCancelled = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 142, customer_id: "cust-1", status: "cancelled" },
              error: null,
            }),
          })),
        })),
      })),
    };
    await expect(
      verifyIdempotencyReplayBooking(adminCancelled as never, sampleBooking, "cust-1"),
    ).resolves.toEqual({ ok: false });
  });
});

describe("beginCustomerBookingIdempotency replay verify", () => {
  it("success + appointment esistente → replay", async () => {
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const loadMaybe = vi.fn().mockResolvedValue({
      data: baseRow,
      error: null,
    });
    const verifyMaybe = vi.fn().mockResolvedValue({
      data: { id: 142, customer_id: "cust-1", status: "scheduled" },
      error: null,
    });
    let fromCall = 0;
    const admin = {
      from: vi.fn(() => {
        fromCall += 1;
        if (fromCall === 1) {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({ single: insertSingle })),
            })),
          };
        }
        // loadIdempotencyRow
        if (fromCall === 2) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle: loadMaybe })),
              })),
            })),
          };
        }
        // verifyIdempotencyReplayBooking
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: verifyMaybe })),
          })),
        };
      }),
    };

    const result = await beginCustomerBookingIdempotency(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      idempotencyKey: "k1",
      requestHash: baseRow.request_hash,
    });
    expect(result).toEqual({ action: "replay", booking: sampleBooking });
  });

  it("success + appointment assente (#142) → conflict gone, mai replay", async () => {
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    const loadMaybe = vi.fn().mockResolvedValue({
      data: baseRow,
      error: null,
    });
    const verifyMaybe = vi.fn().mockResolvedValue({ data: null, error: null });
    let fromCall = 0;
    const admin = {
      from: vi.fn(() => {
        fromCall += 1;
        if (fromCall === 1) {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({ single: insertSingle })),
            })),
          };
        }
        if (fromCall === 2) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle: loadMaybe })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: verifyMaybe })),
          })),
        };
      }),
    };

    const result = await beginCustomerBookingIdempotency(admin as never, {
      userId: "user-1",
      customerId: "cust-1",
      idempotencyKey: "k1",
      requestHash: baseRow.request_hash,
    });
    expect(result).toEqual({
      action: "conflict",
      message: CUSTOMER_BOOKING_IDEMPOTENCY_GONE_MESSAGE,
    });
  });
});
