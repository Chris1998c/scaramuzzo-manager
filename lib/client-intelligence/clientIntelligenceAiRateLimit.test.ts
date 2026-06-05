import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetClientIntelligenceAiRateLimitStoreForTests,
  clientIntelligenceAiRateLimitKey,
  consumeClientIntelligenceAiRateLimit,
} from "./clientIntelligenceAiRateLimit";

describe("clientIntelligenceAiRateLimit", () => {
  beforeEach(() => {
    _resetClientIntelligenceAiRateLimitStoreForTests();
  });

  it("permette la prima chiamata", () => {
    const key = clientIntelligenceAiRateLimitKey("user-a", "cust-1", 2);
    expect(consumeClientIntelligenceAiRateLimit(key).allowed).toBe(true);
  });

  it("blocca chiamate troppo ravvicinate (gap minimo)", () => {
    const key = clientIntelligenceAiRateLimitKey("user-a", "cust-1", 2);
    expect(consumeClientIntelligenceAiRateLimit(key).allowed).toBe(true);
    const blocked = consumeClientIntelligenceAiRateLimit(key);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("isola le chiavi per utente/cliente/salone", () => {
    const keyA = clientIntelligenceAiRateLimitKey("user-a", "cust-1", 2);
    const keyB = clientIntelligenceAiRateLimitKey("user-b", "cust-1", 2);
    const keyC = clientIntelligenceAiRateLimitKey("user-a", "cust-2", 2);
    const keyD = clientIntelligenceAiRateLimitKey("user-a", "cust-1", 3);
    expect(consumeClientIntelligenceAiRateLimit(keyA).allowed).toBe(true);
    expect(consumeClientIntelligenceAiRateLimit(keyB).allowed).toBe(true);
    expect(consumeClientIntelligenceAiRateLimit(keyC).allowed).toBe(true);
    expect(consumeClientIntelligenceAiRateLimit(keyD).allowed).toBe(true);
  });
});
