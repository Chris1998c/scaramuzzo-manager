import {
  BRIDGE_OFFLINE_THRESHOLD_MINUTES,
  BRIDGE_PROCESSING_WARN_MINUTES,
} from "@/lib/bridge/bridgeConstants";

export type BridgeInstallationRow = {
  id: string;
  tenant_id: string | null;
  salon_id: number;
  bridge_id: string;
  name: string | null;
  status: string;
  version: string | null;
  last_seen_at: string | null;
  last_health: Record<string, unknown>;
  revoked_at: string | null;
  salon_name?: string | null;
};

export type BridgeDashboardWarning = {
  severity: "amber" | "red";
  code: string;
  message: string;
};

export type BridgeDashboardRow = BridgeInstallationRow & {
  online: boolean;
  warnings: BridgeDashboardWarning[];
  compact_health: {
    fpmate_reachable: boolean | null;
    supabase_reachable: boolean | null;
    queue_pending: number | null;
    queue_processing: number | null;
    last_job_status: string | null;
    version: string | null;
  };
};

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 60000);
}

function healthBool(h: Record<string, unknown>, key: string): boolean | null {
  const v = h[key];
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function healthNum(h: Record<string, unknown>, key: string): number | null {
  const v = h[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildBridgeDashboardWarnings(
  row: BridgeInstallationRow,
  now = Date.now(),
): BridgeDashboardWarning[] {
  const warnings: BridgeDashboardWarning[] = [];
  const h = row.last_health ?? {};
  const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : NaN;
  const offlineMin = BRIDGE_OFFLINE_THRESHOLD_MINUTES;

  if (row.revoked_at) {
    warnings.push({
      severity: "red",
      code: "installation_revoked",
      message: "Installazione bridge revocata.",
    });
    return warnings;
  }

  if (!row.last_seen_at || Number.isNaN(lastSeenMs)) {
    warnings.push({
      severity: "amber",
      code: "never_seen",
      message: "Bridge mai connesso (nessun heartbeat).",
    });
  } else {
    const ageMin = Math.floor((now - lastSeenMs) / 60000);
    if (ageMin > offlineMin) {
      warnings.push({
        severity: "red",
        code: "bridge_offline",
        message: `Offline da ${ageMin} min (soglia ${offlineMin} min).`,
      });
    }
  }

  const fpmate = healthBool(h, "fpmate_reachable");
  if (fpmate === false) {
    warnings.push({
      severity: "red",
      code: "fpmate_unreachable",
      message: "FPMate non raggiungibile dal bridge.",
    });
  }

  const processing = healthNum(h, "queue_processing") ?? 0;
  if (processing > 0) {
    const lastJob = h.last_job as { updated_at?: string; status?: string } | null;
    const jobAge = lastJob?.updated_at ? minutesSince(lastJob.updated_at) : null;
    if (jobAge != null && jobAge > BRIDGE_PROCESSING_WARN_MINUTES) {
      warnings.push({
        severity: "red",
        code: "processing_stuck",
        message: `Job in processing segnalato da ${jobAge} min (soglia ${BRIDGE_PROCESSING_WARN_MINUTES} min).`,
      });
    } else if (processing > 0) {
      warnings.push({
        severity: "amber",
        code: "processing_active",
        message: `${processing} job in processing sul bridge.`,
      });
    }
  }

  return warnings;
}

export function toBridgeDashboardRow(row: BridgeInstallationRow): BridgeDashboardRow {
  const h = row.last_health ?? {};
  const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : NaN;
  const online =
    !row.revoked_at &&
    Boolean(row.last_seen_at) &&
    !Number.isNaN(lastSeenMs) &&
    Date.now() - lastSeenMs <= BRIDGE_OFFLINE_THRESHOLD_MINUTES * 60 * 1000;

  return {
    ...row,
    online,
    warnings: buildBridgeDashboardWarnings(row),
    compact_health: {
      fpmate_reachable: healthBool(h, "fpmate_reachable"),
      supabase_reachable: healthBool(h, "supabase_reachable"),
      queue_pending: healthNum(h, "queue_pending"),
      queue_processing: healthNum(h, "queue_processing"),
      last_job_status:
        typeof h.last_job_status === "string"
          ? h.last_job_status
          : (h.last_job as { status?: string } | null)?.status ?? null,
      version: row.version ?? (typeof h.version === "string" ? h.version : null),
    },
  };
}

export function buildBridgeDashboardRows(
  rows: BridgeInstallationRow[],
): BridgeDashboardRow[] {
  return rows.map(toBridgeDashboardRow);
}
