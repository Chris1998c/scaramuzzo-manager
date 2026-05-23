import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetMobileLoginRateLimitStoreForTests,
  checkMobileLoginRateLimit,
  mobileLoginRateLimitKey,
  recordMobileLoginFailure,
  resetMobileLoginRateLimit,
} from "@/lib/mobile/mobileLoginRateLimit";

describe("mobileLoginRateLimit", () => {
  beforeEach(() => {
    _resetMobileLoginRateLimitStoreForTests();
  });

  it("blocca dopo troppi tentativi falliti", () => {
    const key = mobileLoginRateLimitKey("1.2.3.4", "STF-1");
    for (let i = 0; i < 5; i++) {
      recordMobileLoginFailure(key);
    }
    const blocked = checkMobileLoginRateLimit(key);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("reset su login riuscito sblocca", () => {
    const key = mobileLoginRateLimitKey("10.0.0.1", "ABC");
    for (let i = 0; i < 5; i++) {
      recordMobileLoginFailure(key);
    }
    resetMobileLoginRateLimit(key);
    expect(checkMobileLoginRateLimit(key).allowed).toBe(true);
  });
});
