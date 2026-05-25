import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CustomerContextError,
  isCustomerContextError,
  requireCustomerContext,
} from "./requireCustomerContext";

vi.mock("@/lib/getAuthenticatedUserFromRequest", () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  createSupabaseClientForRequest: vi.fn(),
}));

vi.mock("@/lib/getUserAccess", () => ({
  getUserAccess: vi.fn(),
}));

import {
  createSupabaseClientForRequest,
  getAuthenticatedUserFromRequest,
} from "@/lib/getAuthenticatedUserFromRequest";
import { getUserAccess } from "@/lib/getUserAccess";

const req = new Request("http://localhost/api/customer/v1/salons");

describe("requireCustomerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserFromRequest).mockResolvedValue({
      ok: true,
      user: { id: "user-1" } as never,
    });
  });

  it("401 se Bearer/cookie non autenticato", async () => {
    vi.mocked(getAuthenticatedUserFromRequest).mockResolvedValueOnce({
      ok: false,
    });

    await expect(requireCustomerContext(req)).rejects.toMatchObject({
      status: 401,
    });
    expect(getUserAccess).not.toHaveBeenCalled();
  });

  it("401 se getUserAccess non autenticato", async () => {
    vi.mocked(getUserAccess).mockRejectedValueOnce(new Error("Not authenticated"));

    await expect(requireCustomerContext(req)).rejects.toMatchObject({
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

    await expect(requireCustomerContext(req)).rejects.toSatisfy((e: unknown) => {
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

    vi.mocked(createSupabaseClientForRequest).mockResolvedValueOnce({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never);

    await expect(requireCustomerContext(req)).rejects.toMatchObject({
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
    const supabaseMock = {
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
    };

    vi.mocked(createSupabaseClientForRequest).mockResolvedValueOnce(
      supabaseMock as never,
    );

    const ctx = await requireCustomerContext(req);
    expect(ctx.authUserId).toBe("user-1");
    expect(ctx.customerId).toBe(customerId);
    expect(ctx.access.role).toBe("cliente");
    expect(ctx.supabase).toBe(supabaseMock);
    expect(getUserAccess).toHaveBeenCalledWith(req);
    expect(getAuthenticatedUserFromRequest).toHaveBeenCalledWith(req);
  });
});
