import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signMobileToken } from "@/lib/mobileSession";

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { POST } from "@/app/api/mobile/attendance/status/route";

describe("POST /api/mobile/attendance/status live gate", () => {
  const prev = process.env.MOBILE_JWT_SECRET;

  beforeEach(() => {
    process.env.MOBILE_JWT_SECRET = "vitest-mobile-jwt-secret-key";
    fromMock.mockReset();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = prev;
  });

  it("collaboratore disattivato → 404 anche con Bearer ancora valido", async () => {
    const token = signMobileToken({ sid: 7, salon_id: 1, salon_ids: [1] });
    fromMock.mockImplementation((table: string) => {
      if (table === "staff") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 7, salon_id: 1, active: false, mobile_enabled: true },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected ${table}`);
    });

    const res = await POST(
      new Request("http://localhost/api/mobile/attendance/status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("attivo: legge status dopo gate live active/mobile", async () => {
    const token = signMobileToken({ sid: 7, salon_id: 1, salon_ids: [1] });
    fromMock.mockImplementation((table: string) => {
      if (table === "staff") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 7, salon_id: 1, active: true, mobile_enabled: true },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "staff_salons") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === "attendance_logs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { type: "in" },
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected ${table}`);
    });

    const res = await POST(
      new Request("http://localhost/api/mobile/attendance/status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: "in" });
  });
});
