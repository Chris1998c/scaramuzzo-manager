import { FISCAL_HEALTH_THRESHOLDS } from "@/lib/fiscal/fiscalHealthConstants";

export type FiscalJobActionRow = {
  id: number;
  status: string;
  kind: string;
  locked_at: string | null;
  created_at: string;
};

/** Allineato a cancel_fiscal_print_job (RPC): processing stale su locked_at o created_at. */
export function isProcessingCancelAllowed(
  lockedAt: string | null,
  createdAt: string,
): boolean {
  const thresholdMs = FISCAL_HEALTH_THRESHOLDS.stuckMinutes * 60_000;
  const now = Date.now();

  if (lockedAt) {
    const t = new Date(lockedAt).getTime();
    if (Number.isNaN(t)) return true;
    return now - t >= thresholdMs;
  }

  const c = new Date(createdAt).getTime();
  if (Number.isNaN(c)) return true;
  return now - c >= thresholdMs;
}

/** @deprecated Usare isProcessingCancelAllowed */
export function isProcessingStuck(lockedAt: string | null): boolean {
  return isProcessingCancelAllowed(lockedAt, new Date(0).toISOString());
}

export type FiscalJobUiActions = {
  requeue: boolean;
  cancel: boolean;
  requeueDisabledReason: string | null;
  cancelDisabledReason: string | null;
  requeueNeedsZConfirm: boolean;
  cancelNeedsZConfirm: boolean;
};

/** Regole UI (allineate alle API server). */
export function getFiscalJobUiActions(
  job: FiscalJobActionRow,
  canAct: boolean,
): FiscalJobUiActions {
  const none: FiscalJobUiActions = {
    requeue: false,
    cancel: false,
    requeueDisabledReason: null,
    cancelDisabledReason: null,
    requeueNeedsZConfirm: false,
    cancelNeedsZConfirm: false,
  };
  if (!canAct) return none;

  const status = job.status.toLowerCase();
  const isZ = job.kind === "z_report";

  if (status === "completed") return none;

  if (status === "failed") {
    return {
      requeue: true,
      cancel: false,
      requeueDisabledReason: null,
      cancelDisabledReason: null,
      requeueNeedsZConfirm: isZ,
      cancelNeedsZConfirm: false,
    };
  }

  if (status === "cancelled") {
    return {
      requeue: false,
      cancel: false,
      requeueDisabledReason:
        "Requeue non disponibile: la RPC requeue_fiscal_print_job non accetta job cancelled.",
      cancelDisabledReason: null,
      requeueNeedsZConfirm: false,
      cancelNeedsZConfirm: false,
    };
  }

  if (status === "pending") {
    return {
      requeue: false,
      cancel: true,
      requeueDisabledReason: null,
      cancelDisabledReason: null,
      requeueNeedsZConfirm: false,
      cancelNeedsZConfirm: isZ,
    };
  }

  if (status === "processing") {
    const stuck = isProcessingCancelAllowed(job.locked_at, job.created_at);
    return {
      requeue: false,
      cancel: stuck,
      requeueDisabledReason: null,
      cancelDisabledReason: stuck
        ? null
        : `Processing attivo (< ${FISCAL_HEALTH_THRESHOLDS.stuckMinutes} min).`,
      requeueNeedsZConfirm: false,
      cancelNeedsZConfirm: isZ,
    };
  }

  return none;
}
