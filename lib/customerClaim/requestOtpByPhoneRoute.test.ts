import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/getAuthenticatedUserFromRequest", () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
}));

vi.mock("@/lib/customerClaimConfig", () => ({
  resolveCustomerClaimOtpPepper: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/customerClaim/findCustomersByPhone", () => ({
  findCustomersByClaimPhone: vi.fn(),
}));

vi.mock("@/lib/customerClaim/requestClaimOtp", () => ({
  requestClaimOtpForCustomer: vi.fn(),
}));

vi.mock("@/lib/customerClaim/rateLimit", () => ({
  canRequestOtp: vi.fn(() => ({ ok: true })),
}));

import { POST } from "@/app/api/customer/claim/request-otp-by-phone/route";
import { getAuthenticatedUserFromRequest } from "@/lib/getAuthenticatedUserFromRequest";

describe("POST /api/customer/claim/request-otp-by-phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 se auth mancante", async () => {
    vi.mocked(getAuthenticatedUserFromRequest).mockResolvedValueOnce({
      ok: false,
    });

    const req = new Request("http://localhost/api/customer/claim/request-otp-by-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "3895817411" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
