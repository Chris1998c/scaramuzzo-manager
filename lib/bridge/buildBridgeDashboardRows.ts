import {
  BRIDGE_OFFLINE_THRESHOLD_MINUTES,
  BRIDGE_PROCESSING_WARN_MINUTES,
  BRIDGE_QUEUED_WARN_MINUTES,
} from "@/lib/bridge/bridgeConstants";
import type { BridgeFiscalSnapshot } from "@/lib/bridge/bridgeFiscalTypes";
import { mergeHealthReconcileCount } from "@/lib/bridge/bridgeFiscalTypes";

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
    queue_failed: number | null;
    reconcile_required: number | null;
    last_job_status: string | null;
    last_error: string | null;
    version: string | null;
  };
};

export type BridgeDashboardEnrichedRow = BridgeDashboardRow & {
  fiscal_snapshot: BridgeFiscalSnapshot | null;
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
  fiscalSnapshot: BridgeFiscalSnapshot | null = null,
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

  const processing = healthNum(h, "queue_processing") ?? fiscalSnapshot?.counts.processing ?? 0;
  if (processing > 0) {
    const lastJob = h.last_job as { updated_at?: string; status?: string } | null;
    const jobAge = lastJob?.updated_at ? minutesSince(lastJob.updated_at) : null;
    const staleFromDb = (fiscalSnapshot?.critical_jobs ?? []).some(
      (j) => j.category === "processing_stale",
    );
    if (
      staleFromDb ||
      (jobAge != null && jobAge > BRIDGE_PROCESSING_WARN_MINUTES)
    ) {
      warnings.push({
        severity: "red",
        code: "processing_stuck",
        message: `Job in processing oltre soglia ${BRIDGE_PROCESSING_WARN_MINUTES} min.`,
      });
    } else if (processing > 0) {
      warnings.push({
        severity: "amber",
        code: "processing_active",
        message: `${processing} job in processing sul bridge.`,
      });
    }
  }

  const pending = healthNum(h, "queue_pending") ?? fiscalSnapshot?.counts.pending ?? 0;
  if (pending > 0 && fiscalSnapshot?.critical_jobs.some((j) => j.category === "pending_stale")) {
    warnings.push({
      severity: "amber",
      code: "pending_stuck",
      message: `Job pending in coda da oltre ${BRIDGE_QUEUED_WARN_MINUTES} min.`,
    });
  }

  const failed =
    healthNum(h, "queue_failed") ?? fiscalSnapshot?.counts.failed ?? 0;
  if (failed > 0) {
    warnings.push({
      severity: "red",
      code: "failed_jobs",
      message: `${failed} job falliti sul salone.`,
    });
  }

  const reconcile = mergeHealthReconcileCount(
    h,
    fiscalSnapshot?.counts.reconcile_required ?? 0,
  );
  if (reconcile > 0) {
    warnings.push({
      severity: "red",
      code: "reconcile_required",
      message: `${reconcile} job richiedono riconciliazione manuale.`,
    });
  }

  if (fiscalSnapshot && !fiscalSnapshot.z_report_completed_today) {
    warnings.push({
      severity: "amber",
      code: "z_report_missing_today",
      message: "Nessuna Z-REPORT completata oggi (Europe/Rome) per questo salone.",
    });
  }

  const lastErr = typeof h.last_error === "string" ? h.last_error : null;
  if (lastErr && lastErr.length > 0) {
    warnings.push({
      severity: "amber",
      code: "last_error",
      message: lastErr.length > 120 ? `${lastErr.slice(0, 120)}…` : lastErr,
    });
  }

  return warnings;
}

export function toBridgeDashboardRow(
  row: BridgeInstallationRow,
  fiscalSnapshot: BridgeFiscalSnapshot | null = null,
): BridgeDashboardRow {
  const h = row.last_health ?? {};
  const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : NaN;
  const online =
    !row.revoked_at &&
    Boolean(row.last_seen_at) &&
    !Number.isNaN(lastSeenMs) &&
    Date.now() - lastSeenMs <= BRIDGE_OFFLINE_THRESHOLD_MINUTES * 60 * 1000;

  const displayStatus =
    row.status === "degraded" ? "degraded" : online ? "online" : "offline";

  return {
    ...row,
    status: displayStatus,
    online,
    warnings: buildBridgeDashboardWarnings(row, Date.now(), fiscalSnapshot),
    compact_health: {
      fpmate_reachable: healthBool(h, "fpmate_reachable"),
      supabase_reachable: healthBool(h, "supabase_reachable"),
      queue_pending: healthNum(h, "queue_pending") ?? fiscalSnapshot?.counts.pending ?? null,
      queue_processing:
        healthNum(h, "queue_processing") ?? fiscalSnapshot?.counts.processing ?? null,
      queue_failed: healthNum(h, "queue_failed") ?? fiscalSnapshot?.counts.failed ?? null,
      reconcile_required: mergeHealthReconcileCount(
        h,
        fiscalSnapshot?.counts.reconcile_required ?? 0,
      ),
      last_job_status:
        typeof h.last_job_status === "string"
          ? h.last_job_status
          : (h.last_job as { status?: string } | null)?.status ?? null,
      last_error: typeof h.last_error === "string" ? h.last_error : null,
      version: row.version ?? (typeof h.version === "string" ? h.version : null),
    },
  };
}

export function buildBridgeDashboardRows(
  rows: BridgeInstallationRow[],
  fiscalBySalon?: Map<number, BridgeFiscalSnapshot>,
): BridgeDashboardRow[] {
  return rows.map((r) =>
    toBridgeDashboardRow(r, fiscalBySalon?.get(r.salon_id) ?? null),
  );
}

export function enrichBridgeDashboardRows(
  rows: BridgeDashboardRow[],
  fiscalBySalon: Map<number, BridgeFiscalSnapshot>,
): BridgeDashboardEnrichedRow[] {
  return rows.map((r) => ({
    ...r,
    fiscal_snapshot: fiscalBySalon.get(r.salon_id) ?? null,
  }));
}
