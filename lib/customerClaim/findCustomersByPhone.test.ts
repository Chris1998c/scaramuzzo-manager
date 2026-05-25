import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { findCustomersByClaimPhone } from "@/lib/customerClaim/findCustomersByPhone";

function chainIn(data: unknown[] | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data, error }),
      ilike: vi.fn().mockResolvedValue({ data, error }),
    }),
  };
}

describe("findCustomersByClaimPhone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("match zero", async () => {
    fromMock.mockReturnValue(chainIn([]));

    const r = await findCustomersByClaimPhone("3895817411");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.customers).toHaveLength(0);
  });

  it("match unico", async () => {
    fromMock.mockReturnValue(
      chainIn([{ id: "cust-1", phone: "393895817411" }]),
    );

    const r = await findCustomersByClaimPhone("3895817411");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.customers).toHaveLength(1);
      expect(r.customers[0].id).toBe("cust-1");
    }
  });

  it("match multiplo", async () => {
    fromMock.mockReturnValue(
      chainIn([
        { id: "cust-1", phone: "393895817411" },
        { id: "cust-2", phone: "+393895817411" },
      ]),
    );

    const r = await findCustomersByClaimPhone("3895817411");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.customers).toHaveLength(2);
  });

  it("input non valido", async () => {
    const r = await findCustomersByClaimPhone("12");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
