import { NextResponse } from "next/server";

import { claimBridgeFiscalJob } from "@/lib/bridge/bridgeFiscalJobs";
import { bridgeJobError, withBridgeAuth } from "@/lib/bridge/bridgeJobsHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimBody = {
  bridge_id?: string;
  salon_id?: number;
};

export async function POST(req: Request) {
  return withBridgeAuth(req, async (auth) => {
    let body: ClaimBody = {};
    try {
      body = (await req.json()) as ClaimBody;
    } catch {
      return bridgeJobError(400, "invalid_json");
    }

    const result = await claimBridgeFiscalJob(auth, body);
    if (!result.ok) {
      return bridgeJobError(result.status, result.error);
    }

    return NextResponse.json({ ok: true, job: result.job });
  });
}
