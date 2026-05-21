import { describe, expect, it } from "vitest";
import {
  canAddCashProduct,
  cashProductStockLabel,
  cashProductStockStatus,
  validateCartProductStock,
} from "./cashProductStock";

describe("cashProductStock", () => {
  it("status e label", () => {
    expect(cashProductStockStatus(0)).toBe("out");
    expect(cashProductStockLabel("out")).toBe("Esaurito");
    expect(cashProductStockStatus(2)).toBe("low");
    expect(cashProductStockStatus(5)).toBe("ok");
  });

  it("canAddCashProduct", () => {
    expect(
      canAddCashProduct({ id: 1, name: "A", price: 10, active: true, stockQty: 1 }),
    ).toBe(true);
    expect(
      canAddCashProduct({ id: 1, name: "A", price: 10, active: true, stockQty: 0 }),
    ).toBe(false);
  });

  it("validateCartProductStock", () => {
    const catalog = [{ id: 1, name: "Shampoo", price: 20, active: true, stockQty: 2 }];
    expect(
      validateCartProductStock(
        [{ kind: "product", id: 1, qty: 3, name: "Shampoo" }],
        catalog,
      ).ok,
    ).toBe(false);
    expect(
      validateCartProductStock(
        [{ kind: "product", id: 1, qty: 2, name: "Shampoo" }],
        catalog,
      ).ok,
    ).toBe(true);
  });
});
