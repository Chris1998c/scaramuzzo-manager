import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock("@/lib/customerClaim/claimShared", () => ({
  getLinkBlock: vi.fn(),
  MAX_VERIFY_ATTEMPTS: 5,
}));

vi.mock("@/lib/customerClaim/otpCrypto", () => ({
  verifyClaimOtp: vi.fn(),
}));

import { getLinkBlock } from "@/lib/customerClaim/claimShared";
import { verifyClaimOtp as verifyOtpHash } from "@/lib/customerClaim/otpCrypto";
import {
  completeClaimOtpVerification,
  validateClaimOtpDigits,
} from "@/lib/customerClaim/verifyClaimOtp";

function challengeChain(challenge: Record<string, unknown> | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: challenge, error }),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
}

function linksInsertChain(inserted: { id: string } | null) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: inserted, error: null }),
      }),
    }),
  };
}

describe("validateClaimOtpDigits", () => {
  it("rifiuta OTP non numerico", () => {
    const res = validateClaimOtpDigits("abc");
    expect(res?.status).toBe(400);
  });
});

describe("completeClaimOtpVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLinkBlock).mockResolvedValue({ ok: true, block: null });
  });

  it("success se OTP valido", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    vi.mocked(verifyOtpHash).mockReturnValue(true);

    fromMock.mockImplementation((table: string) => {
      if (table === "customer_claim_otp_challenges") {
        return challengeChain({
          id: "ch-1",
          otp_hash: "hash",
          expires_at: future,
          attempt_count: 0,
        });
      }
      if (table === "customer_auth_links") {
        return linksInsertChain({ id: "link-1" });
      }
      return challengeChain(null);
    });

    const result = await completeClaimOtpVerification({
      userId: "user-1",
      customerId: "cust-1",
      otpRaw: "123456",
      includeCustomerIdInSuccess: false,
    });

    expect(result.ok).toBe(true);
    const body = await result.response.json();
    expect(body.success).toBe(true);
    expect(body.link_id).toBe("link-1");
    expect(body.customer_id).toBeUndefined();
  });

  it("400 se OTP errato", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    vi.mocked(verifyOtpHash).mockReturnValue(false);

    fromMock.mockImplementation((table: string) => {
      if (table === "customer_claim_otp_challenges") {
        return challengeChain({
          id: "ch-1",
          otp_hash: "hash",
          expires_at: future,
          attempt_count: 0,
        });
      }
      return challengeChain(null);
    });

    const result = await completeClaimOtpVerification({
      userId: "user-1",
      customerId: "cust-1",
      otpRaw: "123456",
    });

    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.code).toBe("otp_invalid");
  });
});
