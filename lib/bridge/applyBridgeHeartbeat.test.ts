import { beforeEach, describe, expect, it, vi } from "vitest";

const updateEq = vi.fn();
const update = vi.fn(() => ({ eq: updateEq }));
const insert = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "bridge_installations") {
        return { update };
      }
      if (table === "bridge_heartbeats") {
        return { insert };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  },
}));

import { applyBridgeHeartbeat } from "@/lib/bridge/bridgeDb";

const installation = {
  id: "inst-uuid",
  tenant_id: null,
  salon_id: 1,
  bridge_id: "roma_1",
  name: null,
  status: "online",
  version: "1.0",
  last_seen_at: null,
  last_health: {},
  revoked_at: null,
};

describe("applyBridgeHeartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEq.mockResolvedValue({ error: null });
    insert.mockResolvedValue({ error: null });
  });

  it("aggiorna installazione e inserisce storico heartbeat", async () => {
    const result = await applyBridgeHeartbeat(installation, {
      bridge_id: "roma_1",
      salon_id: 1,
      version: "1.2",
      checks: { fpmate_reachable: true, supabase_reachable: true },
    });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalled();
    expect(updateEq).toHaveBeenCalledWith("id", installation.id);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        bridge_installation_id: installation.id,
        salon_id: 1,
        bridge_id: "roma_1",
        health: expect.any(Object),
      }),
    );
    const health = insert.mock.calls[0][0].health as Record<string, unknown>;
    expect(health).not.toHaveProperty("token");
    expect(JSON.stringify(health)).not.toMatch(/service.?role/i);
  });
});
