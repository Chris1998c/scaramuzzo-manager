import { describe, expect, it } from "vitest";

import { buildBridgeDashboardWarnings, toBridgeDashboardRow } from "@/lib/bridge/buildBridgeDashboardRows";

describe("buildBridgeDashboardRows", () => {
  it("warning offline > 2 min", () => {
    const old = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const warnings = buildBridgeDashboardWarnings({
      id: "1",
      tenant_id: null,
      salon_id: 1,
      bridge_id: "roma_1",
      name: null,
      status: "offline",
      version: "1.0",
      last_seen_at: old,
      last_health: {},
      revoked_at: null,
    });
    expect(warnings.some((w) => w.code === "bridge_offline")).toBe(true);
  });

  it("warning fpmate false", () => {
    const row = toBridgeDashboardRow({
      id: "1",
      tenant_id: null,
      salon_id: 1,
      bridge_id: "roma_1",
      name: null,
      status: "degraded",
      version: "1.1",
      last_seen_at: new Date().toISOString(),
      last_health: { fpmate_reachable: false, supabase_reachable: true },
      revoked_at: null,
    });
    expect(row.warnings.some((w) => w.code === "fpmate_unreachable")).toBe(true);
  });
});
