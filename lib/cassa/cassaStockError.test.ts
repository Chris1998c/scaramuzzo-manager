import { describe, expect, it } from "vitest";
import {
  CASSA_STOCK_INSUFFICIENT_CODE,
  formatCassaStockInsufficientMessage,
  mapCassaStockRpcError,
} from "./cassaStockError";

describe("mapCassaStockRpcError", () => {
  it("maps close_sale_atomic giacenza insufficiente", () => {
    const mapped = mapCassaStockRpcError(
      "close_sale_atomic: giacenza insufficiente per prodotto 42 (disponibili 1, richiesti 3)",
    );
    expect(mapped?.code).toBe(CASSA_STOCK_INSUFFICIENT_CODE);
    expect(mapped?.status).toBe(409);
    expect(mapped?.productId).toBe(42);
  });

  it("maps negative stock", () => {
    expect(
      mapCassaStockRpcError("negative stock not allowed (product 7, salon 1, qty -1)"),
    ).toMatchObject({ code: CASSA_STOCK_INSUFFICIENT_CODE, productId: 7 });
  });

  it("returns null for unrelated errors", () => {
    expect(mapCassaStockRpcError("sessione cassa chiusa")).toBeNull();
  });
});

describe("formatCassaStockInsufficientMessage", () => {
  it("prefers product name", () => {
    expect(
      formatCassaStockInsufficientMessage({ productId: 1, productName: "Shampoo X" }),
    ).toContain("Shampoo X");
  });
});
