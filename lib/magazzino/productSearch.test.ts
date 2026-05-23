import { describe, expect, it } from "vitest";
import { applyProductSearchOr, productSearchOrClause } from "./productSearch";

describe("productSearchOrClause", () => {
  it("returns null for empty", () => {
    expect(productSearchOrClause("")).toBeNull();
    expect(productSearchOrClause("   ")).toBeNull();
  });

  it("builds name and barcode ilike", () => {
    expect(productSearchOrClause("abc")).toBe("name.ilike.%abc%,barcode.ilike.%abc%");
  });

  it("strips commas from term", () => {
    expect(productSearchOrClause("a,b")).toBe("name.ilike.%a b%,barcode.ilike.%a b%");
  });
});

describe("applyProductSearchOr", () => {
  it("calls or when term present", () => {
    let captured = "";
    const q = {
      or: (f: string) => {
        captured = f;
        return q;
      },
    };
    const out = applyProductSearchOr(q, "x");
    expect(out).toBe(q);
    expect(captured).toContain("barcode.ilike.%x%");
  });

  it("returns query unchanged when empty", () => {
    const q = { or: () => q };
    expect(applyProductSearchOr(q, "")).toBe(q);
  });
});
