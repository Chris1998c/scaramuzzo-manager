import { describe, expect, it } from "vitest";
import { parseMovementReasonLinks } from "./movementLinks";

describe("parseMovementReasonLinks", () => {
  it("parses sale id", () => {
    expect(parseMovementReasonLinks("Vendita #42")).toEqual({
      saleId: 42,
      transferId: null,
    });
  });

  it("parses transfer id", () => {
    expect(parseMovementReasonLinks("transfer_id=7")).toEqual({
      saleId: null,
      transferId: 7,
    });
  });

  it("returns nulls for unrelated reason", () => {
    expect(parseMovementReasonLinks("scarico_app")).toEqual({
      saleId: null,
      transferId: null,
    });
  });
});
