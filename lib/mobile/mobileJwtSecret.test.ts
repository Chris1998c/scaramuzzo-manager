import { afterEach, describe, expect, it } from "vitest";

import {
  getMobileJwtSecret,
  isMobileJwtConfigured,
  requireMobileJwtSecret,
} from "@/lib/mobile/mobileJwtSecret";

describe("mobileJwtSecret", () => {
  const prev = process.env.MOBILE_JWT_SECRET;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.MOBILE_JWT_SECRET;
    } else {
      process.env.MOBILE_JWT_SECRET = prev;
    }
  });

  it("MOBILE_JWT_SECRET mancante → non configurato e require lancia", () => {
    delete process.env.MOBILE_JWT_SECRET;
    expect(isMobileJwtConfigured()).toBe(false);
    expect(getMobileJwtSecret()).toBeNull();
    expect(() => requireMobileJwtSecret()).toThrow(/MOBILE_JWT_SECRET/);
  });

  it("MOBILE_JWT_SECRET presente → configurato", () => {
    process.env.MOBILE_JWT_SECRET = "test-secret-for-vitest";
    expect(isMobileJwtConfigured()).toBe(true);
    expect(requireMobileJwtSecret()).toBe("test-secret-for-vitest");
  });
});
