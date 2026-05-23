import { describe, expect, it } from "vitest";
import {
  MOVIMENTI_PAGE_SIZE,
  movimentiRange,
  parseStockMoveRpcResult,
  totalPages,
} from "./stockMoveResult";

describe("parseStockMoveRpcResult", () => {
  it("parses success and idempotent payloads", () => {
    expect(
      parseStockMoveRpcResult({
        ok: true,
        idempotent: true,
        movement_id: 42,
      }),
    ).toEqual({
      ok: true,
      idempotent: true,
      movement_id: 42,
      product_id: undefined,
      movement_type: undefined,
    });

    expect(parseStockMoveRpcResult({ ok: true, movement_id: 7 })).toMatchObject({
      ok: true,
      idempotent: false,
      movement_id: 7,
    });

    expect(parseStockMoveRpcResult(null)).toBeNull();
    expect(parseStockMoveRpcResult("x")).toBeNull();
  });
});

describe("movimenti pagination helpers", () => {
  it("range per pagina", () => {
    expect(movimentiRange(1)).toEqual({ from: 0, to: MOVIMENTI_PAGE_SIZE - 1 });
    expect(movimentiRange(2)).toEqual({
      from: MOVIMENTI_PAGE_SIZE,
      to: MOVIMENTI_PAGE_SIZE * 2 - 1,
    });
    expect(movimentiRange(0)).toEqual({ from: 0, to: MOVIMENTI_PAGE_SIZE - 1 });
  });

  it("totalPages", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(50)).toBe(1);
    expect(totalPages(51)).toBe(2);
    expect(totalPages(100)).toBe(2);
  });
});
