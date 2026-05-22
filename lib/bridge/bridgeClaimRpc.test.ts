import { describe, expect, it } from "vitest";

import {
  normalizeClaimRpcRows,
  parseClaimRpcRow,
  toJsonSafeValue,
} from "@/lib/bridge/bridgeClaimRpc";

describe("bridgeClaimRpc", () => {
  it("null/[] → nessun job", () => {
    expect(normalizeClaimRpcRows(null)).toEqual([]);
    expect(normalizeClaimRpcRows([])).toEqual([]);
  });

  it("singolo oggetto RPC", () => {
    const rows = normalizeClaimRpcRows({
      id: "42",
      kind: "sale_receipt",
      payload: { a: 1 },
      attempts: 1,
      created_at: "2026-01-01T00:00:00Z",
      sale_id: 9,
      salon_id: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(42);
  });

  it("bigint nel payload → stringa", () => {
    const row = parseClaimRpcRow({
      id: BigInt(1),
      kind: "z_report",
      payload: { n: BigInt(99) },
      attempts: 0,
      created_at: "2026-01-01T00:00:00Z",
      sale_id: null,
      salon_id: 1,
    });
    expect(row?.payload).toEqual({ n: "99" });
    expect(toJsonSafeValue({ x: BigInt(1) })).toEqual({ x: "1" });
  });

  it("riga senza id ignorata", () => {
    expect(parseClaimRpcRow({ kind: "x", created_at: "t", salon_id: 1 })).toBeNull();
  });
});
