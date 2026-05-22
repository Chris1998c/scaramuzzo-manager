import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  bridgeLastJobToJson,
  serializeBridgeLastJob,
  type BridgeLastJobResponse,
} from "@/lib/bridge/bridgeLastJob";

const LAST_JOB_SELECT =
  "id, kind, status, created_at, completed_at, processed_at, locked_at, locked_by, sale_id, error_message, salon_id";

export async function fetchBridgeLastFiscalJob(
  salonId: number,
): Promise<
  | { ok: true; job: BridgeLastJobResponse | null }
  | { ok: false; status: number; error: string }
> {
  try {
    const { data, error } = await supabaseAdmin
      .from("fiscal_print_jobs")
      .select(LAST_JOB_SELECT)
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[bridge] fetch last fiscal job query failed", {
        salon_id: salonId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { ok: false, status: 500, error: "last_job_query_failed" };
    }

    if (!data) {
      return { ok: true, job: null };
    }

    const job = serializeBridgeLastJob(data as Record<string, unknown>);
    if (!job) {
      console.warn("[bridge] last job row not serializable", {
        salon_id: salonId,
        raw_id: (data as Record<string, unknown>).id,
      });
      return { ok: true, job: null };
    }

    return { ok: true, job: bridgeLastJobToJson(job) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bridge] fetch last fiscal job threw", { salon_id: salonId, message: msg });
    return { ok: false, status: 500, error: "last_job_internal_error" };
  }
}
