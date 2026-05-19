import type { FiscalHealthMetrics } from "@/lib/fiscal/fetchFiscalHealthMetrics";
import { FISCAL_HEALTH_THRESHOLDS } from "@/lib/fiscal/fiscalHealthConstants";
import type { PrintBridgeHealthProbe } from "@/lib/fiscal/probePrintBridgeHealth";

export type FiscalHealthWarning = {
  severity: "amber" | "red";
  code: string;
  message: string;
};

export function buildFiscalHealthWarnings(
  metrics: FiscalHealthMetrics,
  bridge: PrintBridgeHealthProbe,
): FiscalHealthWarning[] {
  const warnings: FiscalHealthWarning[] = [];
  const stuckMin = FISCAL_HEALTH_THRESHOLDS.stuckMinutes;

  if (!bridge.configured) {
    warnings.push({
      severity: "amber",
      code: "bridge_not_configured",
      message:
        "Print Bridge non configurato sul server (PRINT_BRIDGE_HEALTH_URL).",
    });
  } else if (!bridge.online) {
    warnings.push({
      severity: "red",
      code: "bridge_offline",
      message: `Print Bridge offline: ${bridge.error ?? "non raggiungibile"}.`,
    });
  }

  if (
    metrics.processingCount > 0 &&
    metrics.oldestProcessingAgeMinutes != null &&
    metrics.oldestProcessingAgeMinutes > stuckMin
  ) {
    warnings.push({
      severity: "red",
      code: "processing_stuck",
      message: `Job in processing da oltre ${metrics.oldestProcessingAgeMinutes} min (soglia ${stuckMin} min).`,
    });
  }

  if (
    metrics.pendingCount > 0 &&
    metrics.oldestPendingAgeMinutes != null &&
    metrics.oldestPendingAgeMinutes > stuckMin
  ) {
    warnings.push({
      severity: "amber",
      code: "pending_stuck",
      message: `Job pending in coda da oltre ${metrics.oldestPendingAgeMinutes} min (soglia ${stuckMin} min).`,
    });
  }

  if (metrics.failedLast24h > 0) {
    warnings.push({
      severity: "red",
      code: "failed_recent",
      message: `${metrics.failedLast24h} job falliti nelle ultime 24 ore.`,
    });
  }

  const pipelineActive =
    metrics.pendingCount > 0 ||
    metrics.processingCount > 0 ||
    metrics.failedLast24h > 0;

  if (pipelineActive && metrics.completedLast24h === 0) {
    warnings.push({
      severity: "amber",
      code: "no_completed_recent",
      message:
        "Nessun job completato nelle ultime 24h nonostante attività in coda o errori.",
    });
  }

  if (metrics.highAttemptsCount > 0) {
    warnings.push({
      severity: "amber",
      code: "high_attempts",
      message: `${metrics.highAttemptsCount} job con ≥${FISCAL_HEALTH_THRESHOLDS.highAttempts} tentativi (pending/processing/failed).`,
    });
  }

  return warnings;
}
