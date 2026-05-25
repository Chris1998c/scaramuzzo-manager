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

vi.mock("@/lib/customerClaim/verifyClaimOtp", () => ({
  completeClaimOtpVerification: vi.fn(),
}));

import { POST } from "@/app/api/customer/claim/verify-otp-by-phone/route";
import { findCustomersByClaimPhone } from "@/lib/customerClaim/findCustomersByPhone";
import { getAuthenticatedUserFromRequest } from "@/lib/getAuthenticatedUserFromRequest";
import { completeClaimOtpVerification } from "@/lib/customerClaim/verifyClaimOtp";
import { NextResponse } from "next/server";

const payload = { phone: "3895817411", otp: "123456" };

function post(body: object) {
  return new Request("http://localhost/api/customer/claim/verify-otp-by-phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/customer/claim/verify-otp-by-phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserFromRequest).mockResolvedValue({
      ok: true,
      user: { id: "user-1" } as never,
    });
  });

  it("401 se auth mancante", async () => {
    vi.mocked(getAuthenticatedUserFromRequest).mockResolvedValueOnce({
      ok: false,
    });

    const res = await POST(post(payload));
    expect(res.status).toBe(401);
  });

  it("400 se phone non valido", async () => {
    const res = await POST(post({ phone: "12", otp: "123456" }));
    expect(res.status).toBe(400);
    expect(findCustomersByClaimPhone).not.toHaveBeenCalled();
  });

  it("404 se zero match", async () => {
    vi.mocked(findCustomersByClaimPhone).mockResolvedValueOnce({
      ok: true,
      customers: [],
    });

    const res = await POST(post(payload));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("phone_not_found");
  });

  it("409 se più match", async () => {
    vi.mocked(findCustomersByClaimPhone).mockResolvedValueOnce({
      ok: true,
      customers: [
        { id: "a", phone: "393895817411" },
        { id: "b", phone: "+393895817411" },
      ],
    });

    const res = await POST(post(payload));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("phone_ambiguous");
  });

  it("200 se verify OTP ok", async () => {
    vi.mocked(findCustomersByClaimPhone).mockResolvedValueOnce({
      ok: true,
      customers: [{ id: "cust-1", phone: "393895817411" }],
    });
    vi.mocked(completeClaimOtpVerification).mockResolvedValueOnce({
      ok: true,
      response: NextResponse.json({ success: true, link_id: "link-1" }),
    });

    const res = await POST(post(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.customer_id).toBeUndefined();
    expect(completeClaimOtpVerification).toHaveBeenCalledWith({
      userId: "user-1",
      customerId: "cust-1",
      otpRaw: "123456",
      linkMethod: "whatsapp_otp",
      includeCustomerIdInSuccess: false,
    });
  });
});
