import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { bridgeJobError, withBridgeAuth } from "@/lib/bridge/bridgeJobsHttp";
import { assertBridgeContext } from "@/lib/bridge/bridgeJobContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withBridgeAuth(req, async (auth) => {
    const url = new URL(req.url);
    const ctx = assertBridgeContext(auth.installation, {
      bridge_id: url.searchParams.get("bridge_id") ?? undefined,
      salon_id: url.searchParams.get("salon_id")
        ? Number(url.searchParams.get("salon_id"))
        : undefined,
    });
    if (!ctx.ok) {
      return bridgeJobError(ctx.status, ctx.error);
    }

    const salonId = auth.installation.salon_id;
    const statuses = ["pending", "processing"] as const;
    const counts: Record<string, number> = {};

    for (const st of statuses) {
      const { count, error } = await supabaseAdmin
        .from("fiscal_print_jobs")
        .select("id", { count: "exact", head: true })
        .eq("salon_id", salonId)
        .eq("status", st);
      if (error) {
        return bridgeJobError(500, error.message);
      }
      counts[st] = count ?? 0;
    }

    return NextResponse.json({
      ok: true,
      salon_id: salonId,
      counts,
    });
  });
}
