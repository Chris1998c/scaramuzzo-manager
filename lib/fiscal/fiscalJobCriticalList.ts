import { FISCAL_HEALTH_THRESHOLDS } from "@/lib/fiscal/fiscalHealthConstants";
import type { FiscalPrintJobDashboardRow } from "@/lib/fiscal/fetchFiscalPrintJobsDashboard";
import {
  getFiscalJobUiActions,
  isProcessingCancelAllowed,
  type FiscalJobActionRow,
} from "@/lib/fiscal/fiscalJobActionRules";

const RECONCILE_RE =
  /reconcile|riconcilia|verificare.*stampante|check.*printer|storno.*manuale/i;

export type CriticalJobCategory =
  | "failed"
  | "reconcile_required"
  | "processing_stale"
  | "pending_stale";

export type CriticalFiscalJob = FiscalPrintJobDashboardRow & {
  category: CriticalJobCategory;
};

function ageMinutes(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 60_000);
}

export function isReconcileRequiredJob(job: FiscalPrintJobDashboardRow): boolean {
  if (job.status !== "failed") return false;
  const msg = String(job.error_message ?? "");
  return RECONCILE_RE.test(msg);
}

export function classifyCriticalJob(
  job: FiscalPrintJobDashboardRow,
): CriticalJobCategory | null {
  const status = job.status.toLowerCase();
  if (status === "failed") {
    return isReconcileRequiredJob(job) ? "reconcile_required" : "failed";
  }
  if (status === "processing") {
    const stuck = isProcessingCancelAllowed(job.locked_at, job.created_at);
    if (stuck) return "processing_stale";
    return null;
  }
  if (status === "pending") {
    const age = ageMinutes(job.created_at);
    if (age != null && age >= FISCAL_HEALTH_THRESHOLDS.stuckMinutes) {
      return "pending_stale";
    }
    return null;
  }
  return null;
}

export function listCriticalFiscalJobs(
  jobs: FiscalPrintJobDashboardRow[],
): CriticalFiscalJob[] {
  const out: CriticalFiscalJob[] = [];
  for (const job of jobs) {
    const category = classifyCriticalJob(job);
    if (category) out.push({ ...job, category });
  }
  const order: Record<CriticalJobCategory, number> = {
    reconcile_required: 0,
    failed: 1,
    processing_stale: 2,
    pending_stale: 3,
  };
  return out.sort((a, b) => order[a.category] - order[b.category]);
}

/** Requeue manuale consentito in UI solo per failed (mai processing attivo). */
export function canManualRequeueJob(
  job: FiscalJobActionRow & {
    error_message?: string | null;
    category?: CriticalJobCategory;
  },
  canAct: boolean,
): { allowed: boolean; reason: string | null } {
  const actions = getFiscalJobUiActions(job, canAct);
  if (!canAct) {
    return { allowed: false, reason: "Sola lettura." };
  }
  if (job.status === "processing") {
    return {
      allowed: false,
      reason:
        "Requeue vietato su processing: lo scontrino potrebbe essere già partito verso FPMate.",
    };
  }
  const reconcile =
    job.category === "reconcile_required" ||
    (job.status === "failed" &&
      job.kind !== "z_report" &&
      isReconcileRequiredJob({
        ...job,
        salon_id: 0,
        sale_id: null,
        cash_session_id: null,
        attempts: 0,
        completed_at: null,
        document: null,
      } as FiscalPrintJobDashboardRow));
  if (reconcile) {
    return {
      allowed: false,
      reason:
        "Riconciliazione richiesta: verificare stampante/documento prima di un requeue.",
    };
  }
  if (actions.requeue) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: actions.requeueDisabledReason ?? "Requeue non disponibile per questo stato.",
  };
}
