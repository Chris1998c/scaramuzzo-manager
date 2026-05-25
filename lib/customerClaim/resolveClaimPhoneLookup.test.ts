import { describe, expect, it } from "vitest";

import { resolveUniqueCustomerFromClaimPhoneLookup } from "@/lib/customerClaim/resolveClaimPhoneLookup";

describe("resolveUniqueCustomerFromClaimPhoneLookup", () => {
  it("404 se zero match", async () => {
    const r = resolveUniqueCustomerFromClaimPhoneLookup({
      ok: true,
      customers: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(404);
      const body = await r.response.json();
      expect(body.code).toBe("phone_not_found");
    }
  });

  it("409 se più match", async () => {
    const r = resolveUniqueCustomerFromClaimPhoneLookup({
      ok: true,
      customers: [
        { id: "a", phone: "393331111111" },
        { id: "b", phone: "+393331111111" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(409);
      const body = await r.response.json();
      expect(body.code).toBe("phone_ambiguous");
    }
  });

  it("400 se lookup invalid", async () => {
    const r = resolveUniqueCustomerFromClaimPhoneLookup({
      ok: false,
      reason: "invalid",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });
});
