import { NextResponse } from "next/server";

import { finalizeBridgeFiscalJob } from "@/lib/bridge/bridgeFiscalJobs";
import { bridgeJobError, withBridgeAuth } from "@/lib/bridge/bridgeJobsHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FinalizeBody = {
  job_id?: number | string;
  success?: boolean;
  error_message?: string | null;
  response_xml?: string | null;
  reconcile?: boolean;
};

function parseJobId(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? Math.trunc(raw)
      : typeof raw === "string"
        ? Math.trunc(Number(raw))
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: Request) {
  return withBridgeAuth(req, async (auth) => {
    let body: FinalizeBody;
    try {
      body = (await req.json()) as FinalizeBody;
    } catch {
      return bridgeJobError(400, "invalid_json");
    }

    const jobId = parseJobId(body.job_id);
    if (jobId == null) {
      return bridgeJobError(400, "job_id_invalid");
    }
    if (typeof body.success !== "boolean") {
      return bridgeJobError(400, "success_required");
    }

    const result = await finalizeBridgeFiscalJob(auth, {
      job_id: jobId,
      success: body.success,
      error_message: body.error_message,
      response_xml: body.response_xml,
      reconcile: body.reconcile === true,
    });

    if (!result.ok) {
      return bridgeJobError(result.status, result.error);
    }

    return NextResponse.json({
      ok: true,
      already_finalized: result.already_finalized,
      sale_updated: result.sale_updated,
      new_job_status: result.new_job_status,
      new_sale_status: result.new_sale_status,
      ...(result.skipped ? { skipped: result.skipped } : {}),
    });
  });
}
