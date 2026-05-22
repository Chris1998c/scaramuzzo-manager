import { describe, expect, it, beforeEach } from "vitest";
import {
  clearCustomerSearchSessionCaches,
  customerQueryCacheKey,
  filterPreloadPool,
  getCachedQueryResults,
  invalidateSalonCustomerCaches,
  normalizeSalonCacheKey,
  setCachedQueryResults,
} from "./customerSearchCache";
import type { CustomerPickerRow } from "@/lib/customers/customerPickerUi";

function row(id: string, first: string, last: string): CustomerPickerRow {
  return {
    id,
    customer_code: id,
    first_name: first,
    last_name: last,
    phone: "",
    email: null,
    address: null,
    notes: null,
    full_name: `${first} ${last}`.trim(),
  };
}

describe("normalizeSalonCacheKey", () => {
  it("distingue saloni numerici", () => {
    expect(normalizeSalonCacheKey(1)).toBe("salon:1");
    expect(normalizeSalonCacheKey(2)).toBe("salon:2");
    expect(normalizeSalonCacheKey(null)).toBe("salon:global");
  });
});

describe("salon-scoped query cache", () => {
  beforeEach(() => {
    clearCustomerSearchSessionCaches();
  });

  it("non condivide risultati tra saloni", () => {
    const q = "mariella";
    setCachedQueryResults(1, q, [row("a1", "Mariella", "Roma")]);
    setCachedQueryResults(2, q, [row("b2", "Mariella", "Napoli")]);

    expect(getCachedQueryResults(1, q)?.[0]?.id).toBe("a1");
    expect(getCachedQueryResults(2, q)?.[0]?.id).toBe("b2");
    expect(getCachedQueryResults(1, q)?.[0]?.last_name).toBe("Roma");
  });

  it("invalidateSalonCustomerCaches rimuove solo il salone target", () => {
    const q = "petrone";
    setCachedQueryResults(1, q, [row("x", "A", "B")]);
    setCachedQueryResults(2, q, [row("y", "C", "D")]);

    invalidateSalonCustomerCaches(1);

    expect(getCachedQueryResults(1, q)).toBeNull();
    expect(getCachedQueryResults(2, q)?.[0]?.id).toBe("y");
  });

  it("chiavi query normalizzate", () => {
    expect(customerQueryCacheKey("  MARIELLA ")).toBe("mariella");
  });
});

describe("filterPreloadPool", () => {
  beforeEach(() => {
    clearCustomerSearchSessionCaches();
  });

  it("pool vuoto senza preload", () => {
    expect(filterPreloadPool(5, "ab")).toEqual([]);
  });
});
