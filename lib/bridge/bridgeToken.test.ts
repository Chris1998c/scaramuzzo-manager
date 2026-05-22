import { describe, expect, it } from "vitest";

import {
  generateBridgeToken,
  hashBridgeToken,
  verifyBridgeTokenHash,
  parseBearerToken,
} from "@/lib/bridge/bridgeToken";

describe("bridgeToken", () => {
  it("hash e verify coerenti", () => {
    const pepper = "test-pepper-only";
    const plain = "scz_br_testtoken123";
    const hash = hashBridgeToken(plain, pepper);
    expect(hash).toHaveLength(64);
    expect(verifyBridgeTokenHash(plain, hash, pepper)).toBe(true);
    expect(verifyBridgeTokenHash("wrong", hash, pepper)).toBe(false);
  });

  it("generateBridgeToken non ripete plaintext", () => {
    const a = generateBridgeToken();
    const b = generateBridgeToken();
    expect(a.plain).not.toBe(b.plain);
    expect(a.plain.startsWith("scz_br_")).toBe(true);
    expect(verifyBridgeTokenHash(a.plain, a.hash)).toBe(true);
  });

  it("parseBearerToken", () => {
    expect(parseBearerToken("Bearer abc")).toBe("abc");
    expect(parseBearerToken(null)).toBeNull();
  });
});
