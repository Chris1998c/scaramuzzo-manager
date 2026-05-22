import { describe, expect, it } from "vitest";

import {
  normalizeAndSanitizeHeartbeatPayload,
  serializedHealthHasNoSecrets,
} from "@/lib/bridge/sanitizeBridgeHealth";

describe("sanitizeBridgeHealth", () => {
  it("normalizza queue e checks senza segreti", () => {
    const out = normalizeAndSanitizeHeartbeatPayload({
      bridge_id: "roma_1",
      salon_id: 1,
      version: "1.1.0",
      online: true,
      worker_enabled: true,
      checks: {
        supabase_reachable: true,
        fpmate_reachable: false,
      },
      queue: { pending: 2, processing: 1, failed: 1 },
      reconcile_required: 2,
      SUPABASE_SERVICE_ROLE_KEY: "must-not-appear",
      token: "secret",
    });
    const json = JSON.stringify(out);
    expect(out.queue_pending).toBe(2);
    expect(out.queue_processing).toBe(1);
    expect(out.queue_failed).toBe(1);
    expect(out.reconcile_required).toBe(2);
    expect(out.fpmate_reachable).toBe(false);
    expect(serializedHealthHasNoSecrets(json)).toBe(true);
    expect(json).not.toContain("must-not-appear");
    expect(out).not.toHaveProperty("token");
  });
});
