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

  it("blocca dopo il limite bookings", () => {
    const key = customerApiRateLimitKey("1.2.3.4", "user-b", "bookings");
    for (let i = 0; i < 10; i++) {
      expect(checkCustomerApiRateLimit(key, "bookings").allowed).toBe(true);
    }
    const blocked = checkCustomerApiRateLimit(key, "bookings");
    expect(blocked.allowed).toBe(false);
  });

  it("blocca dopo il limite bookings_delete", () => {
    const key = customerApiRateLimitKey("1.2.3.4", "user-c", "bookings_delete");
    for (let i = 0; i < 20; i++) {
      expect(checkCustomerApiRateLimit(key, "bookings_delete").allowed).toBe(true);
    }
    const blocked = checkCustomerApiRateLimit(key, "bookings_delete");
    expect(blocked.allowed).toBe(false);
  });
});
