import { describe, expect, it } from "vitest";

import { serializeBridgeLastJob } from "@/lib/bridge/bridgeLastJob";

describe("bridgeLastJob", () => {
  it("null raw → null", () => {
    expect(serializeBridgeLastJob(null)).toBeNull();
  });

  it("serializza job con bigint id", () => {
    const job = serializeBridgeLastJob({
      id: BigInt(99),
      salon_id: 1,
      kind: "sale_receipt",
      status: "completed",
      created_at: "2026-01-01T12:00:00Z",
      completed_at: "2026-01-01T12:01:00Z",
      processed_at: null,
      locked_at: null,
      locked_by: "bridge-dev-macbook",
      sale_id: 5,
      error_message: null,
    });
    expect(job?.id).toBe(99);
    expect(job?.locked_by).toBe("bridge-dev-macbook");
  });

  it("riga incompleta → null", () => {
    expect(
      serializeBridgeLastJob({
        id: 1,
        salon_id: 1,
        kind: "",
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
      }),
    ).toBeNull();
  });
});
