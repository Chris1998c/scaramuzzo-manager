import { describe, expect, it } from "vitest";

import {
  computeBridgeFleetKpis,
  deriveFiscalCassaStatus,
  humanProblemsFromRow,
  isBridgeDevEnvironment,
  partitionBridgeRows,
  printerStatusLabel,
} from "@/lib/bridge/bridgeDashboardUi";
import type { BridgeDashboardEnrichedRow } from "@/lib/bridge/buildBridgeDashboardRows";

function row(partial: Partial<BridgeDashboardEnrichedRow>): BridgeDashboardEnrichedRow {
  return {
    id: "1",
    tenant_id: null,
    salon_id: 1,
    bridge_id: "roma_1",
    name: null,
    status: "online",
    version: "1",
    last_seen_at: new Date().toISOString(),
    last_health: {},
    revoked_at: null,
    online: true,
    warnings: [],
    compact_health: {
      fpmate_reachable: true,
      supabase_reachable: true,
      queue_pending: 0,
      queue_processing: 0,
      queue_failed: 0,
      reconcile_required: 0,
      last_job_status: null,
      last_error: null,
      version: "1",
    },
    fiscal_snapshot: null,
    ...partial,
  };
}

describe("bridgeDashboardUi", () => {
  it("offline se non online", () => {
    expect(deriveFiscalCassaStatus(row({ online: false }))).toBe("offline");
  });

  it("attenzione se fpmate down", () => {
    const base = row({});
    expect(
      deriveFiscalCassaStatus(
        row({
          compact_health: { ...base.compact_health, fpmate_reachable: false },
        }),
      ),
    ).toBe("attenzione");
  });

  it("operativo senza warning", () => {
    expect(deriveFiscalCassaStatus(row({}))).toBe("operativo");
  });

  it("printer labels", () => {
    expect(printerStatusLabel(true).label).toBe("Raggiungibile");
    expect(printerStatusLabel(false).ok).toBe(false);
  });

  it("rileva bridge dev", () => {
    expect(isBridgeDevEnvironment("bridge-dev-macbook")).toBe(true);
    expect(isBridgeDevEnvironment("roma_cassa_1")).toBe(false);
  });

  it("partiziona production vs development", () => {
    const { production, development } = partitionBridgeRows([
      { bridge_id: "roma_cassa_1" },
      { bridge_id: "bridge-dev-macbook" },
    ]);
    expect(production).toHaveLength(1);
    expect(development).toHaveLength(1);
  });

  it("KPI fleet production", () => {
    const kpis = computeBridgeFleetKpis(
      [row({}), row({ online: false })],
      {},
    );
    expect(kpis.total).toBe(2);
    expect(kpis.offline).toBe(1);
    expect(kpis.online).toBe(1);
  });

  it("human problems da warning", () => {
    const problems = humanProblemsFromRow(
      row({
        warnings: [
          {
            severity: "red",
            code: "bridge_offline",
            message: "technical",
          },
        ],
      }),
    );
    expect(problems[0].title).toMatch(/cassa/i);
  });
});
