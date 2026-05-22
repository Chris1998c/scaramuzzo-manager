import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BridgeTokenAuth } from "@/lib/bridge/auth";
import { assertBridgeContext } from "@/lib/bridge/bridgeJobContext";
import { logBridgeJobEvent } from "@/lib/bridge/bridgeJobAudit";
import {
  assertBridgeJobSalonOwnership,
  validateBridgeRequeueGate,
  type BridgeFiscalJobOwnership,
} from "@/lib/bridge/bridgeJobValidation";
import {
  mapClaimRpcError,
  normalizeClaimRpcRows,
  type ClaimRpcRow,
} from "@/lib/bridge/bridgeClaimRpc";
import { buildFinalizeResult } from "@/lib/fiscal/buildFinalizeResult";
import type { BridgeInstallationRecord } from "@/lib/bridge/processBridgeHeartbeat";

export type BridgeClaimedJob = {
  id: number;
  kind: string;
  payload: unknown;
  attempts: number;
  created_at: string;
  sale_id: number | null;
  salon_id: number;
  status?: string;
  locked_by?: string | null;
  locked_at?: string | null;
};

type FinalizeRpcRow = {
  ok: boolean;
  already_finalized: boolean;
  sale_updated: boolean;
  new_job_status: string | null;
  new_sale_status: string | null;
  skipped_reason: string | null;
};

function serializeClaimedJob(row: ClaimRpcRow): BridgeClaimedJob {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload ?? null,
    attempts: row.attempts,
    created_at: row.created_at,
    sale_id: row.sale_id,
    salon_id: row.salon_id,
    status: row.status != null ? String(row.status) : "processing",
    locked_by: row.locked_by != null ? String(row.locked_by) : null,
    locked_at: row.locked_at != null ? String(row.locked_at) : null,
  };
}

export async function claimBridgeFiscalJob(
  auth: BridgeTokenAuth,
  body: { bridge_id?: string; salon_id?: number },
): Promise<
  | { ok: true; job: BridgeClaimedJob | null }
  | { ok: false; status: number; error: string }
> {
  const ctx = assertBridgeContext(auth.installation, {
    bridge_id: body.bridge_id,
    salon_id: body.salon_id,
  });
  if (!ctx.ok) return ctx;

  const inst = auth.installation;
  const salonId = coerceClaimSalonId(inst.salon_id);
  if (salonId == null) {
    console.error("[bridge] claim invalid installation salon_id", {
      installation_id: inst.id,
      salon_id: inst.salon_id,
    });
    return { ok: false, status: 500, error: "installation_salon_invalid" };
  }

  let data: unknown;
  let error: { message?: string; code?: string; details?: string } | null;
  try {
    const rpcRes = await supabaseAdmin.rpc("claim_fiscal_print_jobs", {
      p_bridge_id: inst.bridge_id,
      p_limit: 1,
      p_salon_id: salonId,
    });
    data = rpcRes.data;
    error = rpcRes.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bridge] claim_fiscal_print_jobs threw", {
      bridge_id: inst.bridge_id,
      salon_id: salonId,
      message: msg,
    });
    return { ok: false, status: 500, error: "claim_failed" };
  }

  if (error) {
    const mapped = mapClaimRpcError(error.message ?? "claim_failed", error.code);
    console.error("[bridge] claim_fiscal_print_jobs rpc error", {
      bridge_id: inst.bridge_id,
      salon_id: salonId,
      code: error.code,
      message: error.message,
      details: error.details,
      mapped: mapped.error,
    });
    return { ok: false, status: mapped.status, error: mapped.error };
  }

  const rows = normalizeClaimRpcRows(data);
  if (rows.length === 0) {
    if (claimRpcRawNonEmpty(data)) {
      console.warn("[bridge] claim rpc returned data but no parseable job row", {
        bridge_id: inst.bridge_id,
        salon_id: salonId,
        data_type: Array.isArray(data) ? "array" : typeof data,
        raw_length: Array.isArray(data) ? data.length : 1,
      });
    }
    return { ok: true, job: null };
  }

  const first = rows[0];
  const job = serializeClaimedJob(first);

  try {
    await logBridgeJobEvent(inst, "claim", {
      job_id: job.id,
      payload: { kind: job.kind },
    });
  } catch (auditErr) {
    console.error("[bridge] claim audit failed (non-blocking)", {
      job_id: job.id,
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  return { ok: true, job };
}

function claimRpcRawNonEmpty(data: unknown): boolean {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  return typeof data === "object";
}

function coerceClaimSalonId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

export async function finalizeBridgeFiscalJob(
  auth: BridgeTokenAuth,
  body: {
    job_id: number;
    success: boolean;
    error_message?: string | null;
    response_xml?: string | null;
    reconcile?: boolean;
  },
): Promise<
  | {
      ok: true;
      already_finalized: boolean;
      sale_updated: boolean;
      new_job_status: string | null;
      new_sale_status: string | null;
      skipped?: string | null;
    }
  | { ok: false; status: number; error: string }
> {
  const jobId = body.job_id;
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return { ok: false, status: 400, error: "job_id_invalid" };
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select(
      "id, salon_id, kind, status, locked_by, payload, sale_id, cash_session_id, locked_at, attempts, created_at, error_message",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, status: 404, error: "job_not_found" };
  }

  const row = job as BridgeFiscalJobOwnership;
  const own = assertBridgeJobSalonOwnership(auth.installation, row);
  if (!own.ok) return own;

  const inst = auth.installation;
  let errorMessage =
    typeof body.error_message === "string" ? body.error_message.trim() || null : null;

  if (body.reconcile === true && body.success !== true) {
    const prefix = "[reconcile_required]";
    errorMessage = errorMessage
      ? `${prefix} ${errorMessage}`
      : `${prefix} Verificare documento sulla stampante prima di retry.`;
  }

  const pResult = buildFinalizeResult({
    response_xml: body.response_xml,
    responseXml: body.response_xml,
    success: body.success,
    error_message: errorMessage,
  });

  const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
    "finalize_fiscal_job_atomic",
    {
      p_job_id: jobId,
      p_success: body.success === true,
      p_error_message: errorMessage,
      p_result: pResult,
      p_bridge_id: inst.bridge_id,
    },
  );

  if (rpcErr) {
    console.error("[bridge] finalize_fiscal_job_atomic", rpcErr);
    return { ok: false, status: 500, error: rpcErr.message ?? "finalize_failed" };
  }

  const out = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as FinalizeRpcRow | null)
    : ((rpcData ?? null) as FinalizeRpcRow | null);

  if (!out) {
    return { ok: false, status: 500, error: "finalize_invalid_response" };
  }

  if (!out.ok && out.skipped_reason === "job_not_found") {
    return { ok: false, status: 404, error: "job_not_found" };
  }

  if (!out.ok) {
    const reason = out.skipped_reason ?? "finalize_skipped";
    if (reason === "bridge_ownership_mismatch" || reason === "job_salon_mismatch") {
      return { ok: false, status: 403, error: reason };
    }
    return { ok: false, status: 409, error: reason };
  }

  const auditAction =
    body.reconcile === true && body.success !== true
      ? "reconcile"
      : body.success === true
        ? "finalize_success"
        : "finalize_failed";

  await logBridgeJobEvent(inst, auditAction, {
    job_id: jobId,
    payload: {
      already_finalized: !!out.already_finalized,
      success: body.success === true,
      reconcile: body.reconcile === true,
      skipped_reason: out.skipped_reason,
    },
  });

  return {
    ok: true,
    already_finalized: !!out.already_finalized,
    sale_updated: !!out.sale_updated,
    new_job_status: out.new_job_status,
    new_sale_status: out.new_sale_status,
    skipped: out.skipped_reason,
  };
}

export async function requeueBridgeFiscalJob(
  auth: BridgeTokenAuth,
  body: { job_id: number; confirm_z_report?: boolean },
): Promise<
  | { ok: true; job: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  const jobId = body.job_id;
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return { ok: false, status: 400, error: "job_id_invalid" };
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select(
      "id, salon_id, kind, status, locked_at, sale_id, cash_session_id, error_message, locked_by, attempts, created_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, status: 404, error: "job_not_found" };
  }

  const row = job as BridgeFiscalJobOwnership;
  const own = assertBridgeJobSalonOwnership(auth.installation, row);
  if (!own.ok) return own;

  const gate = validateBridgeRequeueGate(row, {
    confirmZReport: body.confirm_z_report === true,
  });
  if (!gate.ok) {
    return gate;
  }

  const { data, error } = await supabaseAdmin.rpc("requeue_fiscal_print_job", {
    p_job_id: jobId,
    p_force: gate.force,
  });

  if (error) {
    const msg = error.message ?? "requeue_failed";
    if (/non trovato/i.test(msg)) {
      return { ok: false, status: 404, error: msg };
    }
    if (/non consentito|non stale/i.test(msg)) {
      return { ok: false, status: 409, error: msg };
    }
    return { ok: false, status: 500, error: msg };
  }

  const updated = Array.isArray(data) && data.length > 0 ? data[0] : data;
  if (!updated) {
    return { ok: false, status: 500, error: "requeue_empty_response" };
  }

  await logBridgeJobEvent(auth.installation, "requeue", {
    job_id: jobId,
    payload: { kind: row.kind, previous_status: row.status },
  });

  return { ok: true, job: updated as Record<string, unknown> };
}

export async function nextBridgeFiscalJob(
  auth: BridgeTokenAuth,
  ctx: { bridge_id?: string; salon_id?: number },
): Promise<
  | { ok: true; job: BridgeClaimedJob | null }
  | { ok: false; status: number; error: string }
> {
  return claimBridgeFiscalJob(auth, ctx);
}

export type { BridgeInstallationRecord };
