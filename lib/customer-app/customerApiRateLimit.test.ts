import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetCustomerApiRateLimitStoreForTests,
  checkCustomerApiRateLimit,
  customerApiRateLimitKey,
} from "./customerApiRateLimit";

describe("customerApiRateLimit", () => {
  beforeEach(() => {
    _resetCustomerApiRateLimitStoreForTests();
  });

  it("blocca dopo il limite availability", () => {
    const key = customerApiRateLimitKey("1.2.3.4", "user-a", "availability");
    for (let i = 0; i < 30; i++) {
      expect(checkCustomerApiRateLimit(key, "availability").allowed).toBe(true);
    }
    const blocked = checkCustomerApiRateLimit(key, "availability");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });
});
