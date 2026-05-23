import { describe, expect, it } from "vitest";
import { parseCreateTransferRpcResult } from "./transferRpc";

describe("parseCreateTransferRpcResult", () => {
  it("parses success payload", () => {
    expect(parseCreateTransferRpcResult({ ok: true, transfer_id: 9 })).toEqual({
      ok: true,
      idempotent: false,
      transfer_id: 9,
    });
  });

  it("parses idempotent replay", () => {
    expect(
      parseCreateTransferRpcResult({ ok: true, idempotent: true, transfer_id: 3 }),
    ).toMatchObject({ idempotent: true, transfer_id: 3 });
  });
});
