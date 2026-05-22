import { NextResponse } from "next/server";

import { nextBridgeFiscalJob } from "@/lib/bridge/bridgeFiscalJobs";
import { bridgeJobError, withBridgeAuth } from "@/lib/bridge/bridgeJobsHttp";

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
    const bridge_id = url.searchParams.get("bridge_id")?.trim() || undefined;
    const salon_id = parseSalonId(url.searchParams.get("salon_id"));

    const result = await nextBridgeFiscalJob(auth, { bridge_id, salon_id });
    if (!result.ok) {
      return bridgeJobError(result.status, result.error);
    }

    return NextResponse.json({ ok: true, job: result.job });
  });
}
