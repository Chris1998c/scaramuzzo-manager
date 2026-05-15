// app/api/fiscal/requeue/route.ts
// Requeue manuale job fiscale (coordinator).
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequeueBody = {
  job_id?: number | string;
  force?: boolean;
};

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const access = await getUserAccess();
    if (access.role !== "coordinator") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    let body: RequeueBody;
    try {
      body = (await req.json()) as RequeueBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const jobIdRaw = body.job_id;
    const jobId =
      typeof jobIdRaw === "number"
        ? Math.trunc(jobIdRaw)
        : typeof jobIdRaw === "string"
          ? Math.trunc(Number(jobIdRaw))
          : NaN;

    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "job_id obbligatorio e valido" }, { status: 400 });
    }

    const force = body.force === true;

    const { data, error } = await supabaseAdmin.rpc("requeue_fiscal_print_job", {
      p_job_id: jobId,
      p_force: force,
    });

    if (error) {
      const msg = error.message ?? "Errore requeue job fiscale";
      if (/non trovato/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (/non consentito|non stale/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const job = Array.isArray(data) && data.length > 0 ? data[0] : data;
    if (!job) {
      return NextResponse.json({ error: "Job non restituito dalla RPC" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore requeue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
