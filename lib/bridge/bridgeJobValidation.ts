import type { BridgeInstallationRecord } from "@/lib/bridge/processBridgeHeartbeat";
import { assertBridgeContext } from "@/lib/bridge/bridgeJobContext";
import { canManualRequeueJob } from "@/lib/fiscal/fiscalJobCriticalList";
import { classifyCriticalJob } from "@/lib/fiscal/fiscalJobCriticalList";
import type { FiscalPrintJobActionRecord } from "@/lib/fiscal/fetchFiscalPrintJobById";
import { validateRequeueFiscalJob } from "@/lib/fiscal/validateFiscalJobRequeue";

export type BridgeFiscalJobOwnership = FiscalPrintJobActionRecord & {
  error_message: string | null;
  locked_by: string | null;
  attempts: number;
  created_at: string;
};

export function assertBridgeJobSalonOwnership(
  installation: BridgeInstallationRecord,
  job: Pick<BridgeFiscalJobOwnership, "salon_id" | "locked_by">,
): { ok: true } | { ok: false; status: number; error: string } {
  if (job.salon_id !== installation.salon_id) {
    return { ok: false, status: 403, error: "job_salon_mismatch" };
  }
  const lockedBy = job.locked_by?.trim() ?? "";
  if (lockedBy && lockedBy !== installation.bridge_id) {
    return { ok: false, status: 403, error: "job_bridge_ownership_mismatch" };
  }
  return { ok: true };
}

export function validateBridgeContextBody(
  installation: BridgeInstallationRecord,
  body: { bridge_id?: string; salon_id?: number },
): { ok: true } | { ok: false; status: number; error: string } {
  return assertBridgeContext(installation, body);
}

/** Gate requeue bridge: failed safe, mai reconcile, mai processing attivo. */
export function validateBridgeRequeueGate(
  job: BridgeFiscalJobOwnership,
  opts: { confirmZReport: boolean },
): { ok: true; force: boolean } | { ok: false; status: number; error: string } {
  if (job.status === "processing") {
    return {
      ok: false,
      status: 409,
      error:
        "requeue_blocked_processing: lo scontrino potrebbe essere già partito verso FPMate",
    };
  }

  const category = classifyCriticalJob({
    id: job.id,
    created_at: job.created_at,
    salon_id: job.salon_id,
    kind: job.kind,
    status: job.status,
    sale_id: job.sale_id,
    cash_session_id: job.cash_session_id,
    attempts: job.attempts,
    error_message: job.error_message,
    locked_at: job.locked_at,
    completed_at: null,
    document: null,
  });

  const manual = canManualRequeueJob(
    {
      id: job.id,
      kind: job.kind,
      status: job.status,
      locked_at: job.locked_at,
      created_at: job.created_at,
      error_message: job.error_message,
      category: category ?? undefined,
    },
    true,
  );
  if (!manual.allowed) {
    return {
      ok: false,
      status: 409,
      error: manual.reason ?? "requeue_not_allowed",
    };
  }

  const rpcGate = validateRequeueFiscalJob(job, opts);
  if (!rpcGate.ok) {
    return { ok: false, status: rpcGate.status, error: rpcGate.message };
  }

  return { ok: true, force: rpcGate.force };
}
