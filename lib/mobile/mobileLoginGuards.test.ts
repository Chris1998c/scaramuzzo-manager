import { describe, expect, it } from "vitest";

import { assertStaffEligibleForMobileLogin } from "@/lib/mobile/mobileLoginGuards";

describe("mobileLoginGuards", () => {
  it("active=false → 403 con messaggio chiaro", () => {
    const r = assertStaffEligibleForMobileLogin({
      active: false,
      mobile_enabled: true,
      mobile_pin_hash: "hash",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toMatch(/non attivo/i);
    }
  });

  it("mobile_enabled=false → 403", () => {
    const r = assertStaffEligibleForMobileLogin({
      active: true,
      mobile_enabled: false,
      mobile_pin_hash: "hash",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
    }
  });

  it("staff attivo con PIN → ok", () => {
    expect(
      assertStaffEligibleForMobileLogin({
        active: true,
        mobile_enabled: true,
        mobile_pin_hash: "hash",
      }).ok,
    ).toBe(true);
  });
});
