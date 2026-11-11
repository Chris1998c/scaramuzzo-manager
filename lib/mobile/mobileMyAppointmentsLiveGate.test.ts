import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signMobileToken } from "@/lib/mobileSession";

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { POST } from "@/app/api/mobile/my-appointments/route";

/**
 * Login valido (JWT con sedi 1+2) → revoca sede 2 da staff_salons → stesso token
 * non deve più leggere my-appointments per salon_id=2.
 */
describe("POST /api/mobile/my-appointments live gate", () => {
  const prev = process.env.MOBILE_JWT_SECRET;

  beforeEach(() => {
    process.env.MOBILE_JWT_SECRET = "vitest-mobile-jwt-secret-key";
    fromMock.mockReset();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = prev;
  });

  function staffBuilder(row: {
    id: number;
    salon_id: number;
    active: boolean;
    mobile_enabled: boolean;
  }) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    };
  }

  function staffSalonsBuilder(salonIds: number[]) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: salonIds.map((salon_id) => ({ salon_id })),
          error: null,
        }),
      }),
    };
  }

  it("dopo revoca sede 2: stesso JWT → 403 su salon_id=2; salon_id=1 ancora OK", async () => {
    const token = signMobileToken({ sid: 10, salon_id: 1, salon_ids: [1, 2] });

    fromMock.mockImplementation((table: string) => {
      if (table === "staff") {
        return staffBuilder({
          id: 10,
          salon_id: 1,
          active: true,
          mobile_enabled: true,
        });
      }
      if (table === "staff_salons") {
        return staffSalonsBuilder([]);
      }
      if (table === "appointments") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn(self);
        chain.eq = vi.fn(self);
        chain.gte = vi.fn().mockResolvedValue({ data: [], error: null });
        chain.in = vi.fn(self);
        chain.order = vi.fn(self);
        return chain;
      }
      if (table === "appointment_services") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = vi.fn(self);
        chain.eq = vi.fn().mockResolvedValue({ data: [], error: null });
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const denied = await POST(
      new Request("http://localhost/api/mobile/my-appointments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ salon_id: 2 }),
      }),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Forbidden" });

    const allowed = await POST(
      new Request("http://localhost/api/mobile/my-appointments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ salon_id: 1 }),
      }),
    );
    expect(allowed.status).toBe(200);
    const body = await allowed.json();
    expect(body.success).toBe(true);
    expect(body.salon_id).toBe(1);
    expect(body.rows).toEqual([]);
  });

  it("mobile_enabled=false con JWT ancora valido → 403", async () => {
    const token = signMobileToken({ sid: 10, salon_id: 1, salon_ids: [1] });
    fromMock.mockImplementation((table: string) => {
      if (table === "staff") {
        return staffBuilder({
          id: 10,
          salon_id: 1,
          active: true,
          mobile_enabled: false,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await POST(
      new Request("http://localhost/api/mobile/my-appointments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Mobile access disabled" });
  });

  it("active=false con JWT ancora valido → 404", async () => {
    const token = signMobileToken({ sid: 10, salon_id: 1, salon_ids: [1] });
    fromMock.mockImplementation((table: string) => {
      if (table === "staff") {
        return staffBuilder({
          id: 10,
          salon_id: 1,
          active: false,
          mobile_enabled: true,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await POST(
      new Request("http://localhost/api/mobile/my-appointments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Staff not found" });
  });
});
