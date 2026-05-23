import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeMobileSalonIds,
  signMobileToken,
  verifyMobileToken,
} from "@/lib/mobileSession";

describe("mobileSession JWT salon_ids", () => {
  const prev = process.env.MOBILE_JWT_SECRET;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.MOBILE_JWT_SECRET;
    } else {
      process.env.MOBILE_JWT_SECRET = prev;
    }
  });

  it("JWT include salon_ids e verify li restituisce", () => {
    process.env.MOBILE_JWT_SECRET = "vitest-mobile-jwt-secret-key";
    const token = signMobileToken({
      sid: 42,
      salon_id: 1,
      salon_ids: [2, 1, 1],
    });
    const v = verifyMobileToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.sid).toBe(42);
      expect(v.salon_id).toBe(1);
      expect(v.salon_ids).toEqual([1, 2]);
    }
  });

  it("normalizeMobileSalonIds deduplica e ordina", () => {
    expect(normalizeMobileSalonIds(5, [2, 5, 9])).toEqual([2, 5, 9]);
  });
});
