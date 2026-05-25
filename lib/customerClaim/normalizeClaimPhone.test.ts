import { describe, expect, it } from "vitest";

import {
  canonicalItalianMobileDigits,
  claimPhoneLookupKeys,
  claimPhonesEquivalent,
  parseClaimPhoneInput,
  stripPhoneToDigits,
} from "@/lib/customerClaim/normalizeClaimPhone";

describe("stripPhoneToDigits", () => {
  it("rimuove spazi, + e trattini", () => {
    expect(stripPhoneToDigits("+39 389-581 7411")).toBe("393895817411");
  });
});

describe("claimPhoneLookupKeys", () => {
  it("389… genera anche 39389… e +39389…", () => {
    const keys = claimPhoneLookupKeys("3895817411");
    expect(keys).toContain("3895817411");
    expect(keys).toContain("393895817411");
    expect(keys).toContain("+393895817411");
  });

  it("+39389… genera forma nazionale", () => {
    const keys = claimPhoneLookupKeys("393895817411");
    expect(keys).toContain("3895817411");
    expect(keys).toContain("393895817411");
  });
});

describe("parseClaimPhoneInput", () => {
  it("accetta input con prefisso internazionale", () => {
    const r = parseClaimPhoneInput("+39 389 581 7411");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.canonical).toBe("3895817411");
      expect(r.lookupKeys).toContain("393895817411");
    }
  });

  it("rifiuta numero troppo corto", () => {
    expect(parseClaimPhoneInput("12345").ok).toBe(false);
  });
});

describe("claimPhonesEquivalent", () => {
  it("confronta varianti IT", () => {
    expect(claimPhonesEquivalent("393895817411", "3895817411")).toBe(true);
    expect(claimPhonesEquivalent("+393895817411", "3895817411")).toBe(true);
    expect(claimPhonesEquivalent("3331234567", "3895817411")).toBe(false);
  });
});

describe("canonicalItalianMobileDigits", () => {
  it("normalizza a cifre nazionali", () => {
    expect(canonicalItalianMobileDigits("393331234567")).toBe("3331234567");
  });
});
