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

    try {
      const result = await claimBridgeFiscalJob(auth, body);
      if (!result.ok) {
        console.warn("[bridge] POST /jobs/claim rejected", {
          bridge_id: auth.installation.bridge_id,
          salon_id: auth.installation.salon_id,
          status: result.status,
          error: result.error,
          body_bridge_id: body.bridge_id,
          body_salon_id: body.salon_id,
        });
        return bridgeJobError(result.status, result.error);
      }

      return NextResponse.json({ ok: true, job: result.job });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bridge] POST /jobs/claim uncaught", {
        bridge_id: auth.installation.bridge_id,
        salon_id: auth.installation.salon_id,
        message: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
      return bridgeJobError(500, "claim_internal_error", { detail: msg });
    }
  });
}
