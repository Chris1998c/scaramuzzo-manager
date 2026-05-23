import { NextResponse } from "next/server";

import { assertBridgeContext } from "@/lib/bridge/bridgeJobContext";
import { bridgeJobError, withBridgeAuth } from "@/lib/bridge/bridgeJobsHttp";
import { fetchBridgeFiscalJobById } from "@/lib/bridge/fetchBridgeFiscalJobById";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET(req: Request) {
  return withBridgeAuth(req, async (auth) => {
    const url = new URL(req.url);
    const jobId = parsePositiveInt(url.searchParams.get("job_id"));
    if (!jobId) {
      return bridgeJobError(400, "job_id_invalid");
    }

    const ctx = assertBridgeContext(auth.installation, {
      bridge_id: url.searchParams.get("bridge_id")?.trim() || undefined,
      salon_id: parsePositiveInt(url.searchParams.get("salon_id")),
    });
    if (!ctx.ok) {
      return bridgeJobError(ctx.status, ctx.error);
    }

    try {
      const result = await fetchBridgeFiscalJobById(auth.installation, jobId);
      if (!result.ok) {
        return bridgeJobError(result.status, result.error);
      }
      return NextResponse.json({ ok: true, job: result.job });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bridge] GET /jobs/detail uncaught", {
        bridge_id: auth.installation.bridge_id,
        job_id: jobId,
        message: msg,
      });
      return bridgeJobError(500, "job_detail_internal_error", { detail: msg });
    }
  });
}
