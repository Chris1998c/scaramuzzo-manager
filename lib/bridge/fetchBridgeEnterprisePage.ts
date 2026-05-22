import "server-only";

import {
  buildBridgeDashboardRows,
  enrichBridgeDashboardRows,
  type BridgeDashboardEnrichedRow,
} from "@/lib/bridge/buildBridgeDashboardRows";
import {
  fetchBridgeHeartbeatHistory,
  fetchBridgeInstallationsForDashboard,
} from "@/lib/bridge/bridgeDb";
import { BRIDGE_HEARTBEAT_HISTORY_LIMIT } from "@/lib/bridge/bridgeConstants";
import { fetchBridgeFiscalSnapshot } from "@/lib/bridge/fetchBridgeFiscalSnapshot";

export type BridgeInstallationBundle = {
  heartbeats: Awaited<ReturnType<typeof fetchBridgeHeartbeatHistory>>;
  fiscal_snapshot: Awaited<ReturnType<typeof fetchBridgeFiscalSnapshot>>;
};

export type BridgeEnterprisePageData = {
  rows: BridgeDashboardEnrichedRow[];
  bundlesByInstallationId: Record<string, BridgeInstallationBundle>;
};

export async function fetchBridgeEnterprisePageData(
  salonFilter: number | null,
): Promise<BridgeEnterprisePageData> {
  const installations = await fetchBridgeInstallationsForDashboard(salonFilter);
  const salonIds = [...new Set(installations.map((i) => i.salon_id))];

  const fiscalBySalon = new Map<number, Awaited<ReturnType<typeof fetchBridgeFiscalSnapshot>>>();
  await Promise.all(
    salonIds.map(async (sid) => {
      fiscalBySalon.set(sid, await fetchBridgeFiscalSnapshot(sid));
    }),
  );

  const dashboard = buildBridgeDashboardRows(installations, fiscalBySalon);
  const enriched = enrichBridgeDashboardRows(dashboard, fiscalBySalon);

  const bundlesByInstallationId: Record<string, BridgeInstallationBundle> = {};
  await Promise.all(
    enriched.map(async (row) => {
      const [heartbeats, fiscal_snapshot] = await Promise.all([
        fetchBridgeHeartbeatHistory(row.id, BRIDGE_HEARTBEAT_HISTORY_LIMIT),
        Promise.resolve(fiscalBySalon.get(row.salon_id)!),
      ]);
      bundlesByInstallationId[row.id] = { heartbeats, fiscal_snapshot };
    }),
  );

  return { rows: enriched, bundlesByInstallationId };
}
