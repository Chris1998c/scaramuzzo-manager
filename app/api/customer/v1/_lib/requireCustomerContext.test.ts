import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CustomerContextError,
  isCustomerContextError,
  requireCustomerContext,
} from "./requireCustomerContext";

vi.mock("@/lib/getUserAccess", () => ({
  getUserAccess: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  createServerSupabase: vi.fn(),
}));

import { getUserAccess } from "@/lib/getUserAccess";
import { createServerSupabase } from "@/lib/supabaseServer";

describe("requireCustomerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 se getUserAccess non autenticato", async () => {
    vi.mocked(getUserAccess).mockRejectedValueOnce(new Error("Not authenticated"));

    await expect(requireCustomerContext()).rejects.toMatchObject({
      status: 401,
    });
  });

  it("403 se ruolo non cliente", async () => {
    vi.mocked(getUserAccess).mockResolvedValueOnce({
      role: "reception",
      allowedSalonIds: [1],
      allowedSalons: [{ id: 1, name: "Roma" }],
      defaultSalonId: 1,
      staffId: 1,
      staffSalonId: 1,
    });

    await expect(requireCustomerContext()).rejects.toSatisfy((e: unknown) => {
      expect(isCustomerContextError(e)).toBe(true);
      expect((e as CustomerContextError).status).toBe(403);
      return true;
    });
  });

  it("403 se cliente senza link", async () => {
    vi.mocked(getUserAccess).mockResolvedValueOnce({
      role: "cliente",
      allowedSalonIds: [],
      allowedSalons: [],
      defaultSalonId: null,
      staffId: null,
      staffSalonId: null,
    });

    vi.mocked(createServerSupabase).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never);

    await expect(requireCustomerContext()).rejects.toMatchObject({
      status: 403,
    });
  });

  it("ritorna contesto se cliente linkato", async () => {
    vi.mocked(getUserAccess).mockResolvedValueOnce({
      role: "cliente",
      allowedSalonIds: [],
      allowedSalons: [],
      defaultSalonId: null,
      staffId: null,
      staffSalonId: null,
    });

    const customerId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    vi.mocked(createServerSupabase).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { customer_id: customerId },
              error: null,
            }),
          }),
        }),
      }),
    } as never);

    const ctx = await requireCustomerContext();
    expect(ctx.authUserId).toBe("user-1");
    expect(ctx.customerId).toBe(customerId);
    expect(ctx.access.role).toBe("cliente");
  });
});
