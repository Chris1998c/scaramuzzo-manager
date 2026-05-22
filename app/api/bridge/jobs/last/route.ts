import { NextResponse } from "next/server";

import { assertBridgeContext } from "@/lib/bridge/bridgeJobContext";
import { bridgeJobError, withBridgeAuth } from "@/lib/bridge/bridgeJobsHttp";
import { fetchBridgeLastFiscalJob } from "@/lib/bridge/fetchBridgeLastFiscalJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSalonId(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function GET(req: Request) {
  return withBridgeAuth(req, async (auth) => {
    const url = new URL(req.url);
    const ctx = assertBridgeContext(auth.installation, {
      bridge_id: url.searchParams.get("bridge_id")?.trim() || undefined,
      salon_id: parseSalonId(url.searchParams.get("salon_id")),
    });
    if (!ctx.ok) {
      return bridgeJobError(ctx.status, ctx.error);
    }

    const salonId = auth.installation.salon_id;

    try {
      const result = await fetchBridgeLastFiscalJob(salonId);
      if (!result.ok) {
        console.warn("[bridge] GET /jobs/last failed", {
          bridge_id: auth.installation.bridge_id,
          salon_id: salonId,
          error: result.error,
        });
        return bridgeJobError(result.status, result.error);
      }

      return NextResponse.json({ ok: true, job: result.job });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bridge] GET /jobs/last uncaught", {
        bridge_id: auth.installation.bridge_id,
        salon_id: salonId,
        message: msg,
      });
      return bridgeJobError(500, "last_job_internal_error", { detail: msg });
    }
  });
}
