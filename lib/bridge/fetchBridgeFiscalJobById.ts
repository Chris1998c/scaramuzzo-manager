import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assertBridgeJobSalonOwnership } from "@/lib/bridge/bridgeJobValidation";
import type { BridgeInstallation } from "@/lib/bridge/bridgeInstallations";

const JOB_DETAIL_SELECT =
  "id, salon_id, kind, status, created_at, completed_at, processed_at, locked_at, locked_by, sale_id, cash_session_id, attempts, error_message, result, payload";

function truncateResultField(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = { ...(result as Record<string, unknown>) };
  for (const key of ["response_xml", "responseXml"]) {
    if (typeof r[key] === "string" && r[key].length > 200) {
      r[key] = `[truncated:${r[key].length} chars]`;
    }
  }
  return r;
}

export async function fetchBridgeFiscalJobById(
  installation: BridgeInstallation,
  jobId: number,
): Promise<
  | { ok: true; job: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  try {
    const { data, error } = await supabaseAdmin
      .from("fiscal_print_jobs")
      .select(JOB_DETAIL_SELECT)
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      console.error("[bridge] fetch job detail query failed", {
        job_id: jobId,
        code: error.code,
        message: error.message,
      });
      return { ok: false, status: 500, error: "job_detail_query_failed" };
    }

    if (!data) {
      return { ok: false, status: 404, error: "job_not_found" };
    }

    const row = data as Record<string, unknown>;
    const own = assertBridgeJobSalonOwnership(installation, row);
    if (!own.ok) return own;

    const job = { ...row };
    if (job.result != null) {
      job.result = truncateResultField(job.result);
    }

    return { ok: true, job };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bridge] fetch job detail threw", { job_id: jobId, message: msg });
    return { ok: false, status: 500, error: "job_detail_internal_error" };
  }
}
