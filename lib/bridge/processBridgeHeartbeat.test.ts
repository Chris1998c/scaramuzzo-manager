import { describe, expect, it } from "vitest";

import {
  processBridgeHeartbeatSuccess,
  deriveBridgeStatusFromHealth,
} from "@/lib/bridge/processBridgeHeartbeat";
import { normalizeAndSanitizeHeartbeatPayload } from "@/lib/bridge/sanitizeBridgeHealth";

describe("processBridgeHeartbeat", () => {
  const installation = {
    id: "uuid-1",
    bridge_id: "roma_cassa_1",
    salon_id: 1,
    revoked_at: null,
  };

  it("accetta heartbeat valido", () => {
    const r = processBridgeHeartbeatSuccess(installation, {
      bridge_id: "roma_cassa_1",
      salon_id: 1,
      online: true,
      fpmate_reachable: true,
      supabase_reachable: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("online");
      expect(r.flags.tenant_ready).toBe(true);
    }
  });

  it("revoked installation → 403", () => {
    const r = processBridgeHeartbeatSuccess(
      { ...installation, revoked_at: new Date().toISOString() },
      { bridge_id: "roma_cassa_1", salon_id: 1 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("degraded se fpmate false", () => {
    const health = normalizeAndSanitizeHeartbeatPayload({
      online: true,
      fpmate_reachable: false,
      supabase_reachable: true,
    });
    expect(deriveBridgeStatusFromHealth(health, true)).toBe("degraded");
  });
});
