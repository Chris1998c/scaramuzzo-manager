import { NextResponse } from "next/server";

import { requeueBridgeFiscalJob } from "@/lib/bridge/bridgeFiscalJobs";
import { bridgeJobError, withBridgeAuth } from "@/lib/bridge/bridgeJobsHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequeueBody = {
  job_id?: number | string;
  confirm_z_report?: boolean;
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
    let body: RequeueBody;
    try {
      body = (await req.json()) as RequeueBody;
    } catch {
      return bridgeJobError(400, "invalid_json");
    }

    const jobId = parseJobId(body.job_id);
    if (jobId == null) {
      return bridgeJobError(400, "job_id_invalid");
    }

    const result = await requeueBridgeFiscalJob(auth, {
      job_id: jobId,
      confirm_z_report: body.confirm_z_report === true,
    });

    if (!result.ok) {
      return bridgeJobError(result.status, result.error);
    }

    return NextResponse.json({ ok: true, job: result.job });
  });
}
