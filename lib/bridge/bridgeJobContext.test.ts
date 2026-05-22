import { describe, expect, it } from "vitest";

import { assertBridgeContext } from "@/lib/bridge/bridgeJobContext";

const installation = {
  id: "uuid",
  bridge_id: "roma_1",
  salon_id: 1,
  revoked_at: null,
};

describe("assertBridgeContext", () => {
  it("salon mismatch → 403", () => {
    const r = assertBridgeContext(installation, { salon_id: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("salon_id_mismatch");
  });

  it("bridge_id mismatch → 403", () => {
    const r = assertBridgeContext(installation, { bridge_id: "other" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bridge_id_mismatch");
  });

  it("coerente → ok", () => {
    expect(assertBridgeContext(installation, { bridge_id: "roma_1", salon_id: 1 }).ok).toBe(
      true,
    );
  });
});
