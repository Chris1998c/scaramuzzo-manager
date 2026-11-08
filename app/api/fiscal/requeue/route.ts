import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import { fetchFiscalPrintJobById } from "@/lib/fiscal/fetchFiscalPrintJobById";
import {
  assertSalonAccessForFiscalJob,
  requireFiscalJobActor,
} from "@/lib/fiscal/fiscalJobActionAuth";
import { validateRequeueFiscalJob } from "@/lib/fiscal/validateFiscalJobRequeue";

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
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();

    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const access = await getUserAccess();
    const actor = requireFiscalJobActor(access);
    if (!actor.ok) {
      return NextResponse.json({ error: actor.message }, { status: actor.status });
    }

    let body: RequeueBody;
    try {
      body = (await req.json()) as RequeueBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const jobId = parseJobId(body.job_id);
    if (jobId == null) {
      return NextResponse.json(
        { error: "job_id obbligatorio e valido" },
        { status: 400 },
      );
    }

    const job = await fetchFiscalPrintJobById(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job non trovato" }, { status: 404 });
    }

    const salonGate = assertSalonAccessForFiscalJob(access, job.salon_id);
    if (!salonGate.ok) {
      return NextResponse.json({ error: salonGate.message }, { status: salonGate.status });
    }

    const requeueGate = validateRequeueFiscalJob(job, {
      confirmZReport: body.confirm_z_report === true,
    });
    if (!requeueGate.ok) {
      return NextResponse.json(
        { error: requeueGate.message },
        { status: requeueGate.status },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("requeue_fiscal_print_job", {
      p_job_id: jobId,
      p_force: requeueGate.force,
    });

    if (error) {
      const msg = error.message ?? "Errore rimessa in coda job fiscale";
      if (/non trovato/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (/non consentito|non stale/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const updated = Array.isArray(data) && data.length > 0 ? data[0] : data;
    if (!updated) {
      return NextResponse.json(
        { error: "Job non restituito dalla RPC" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, job: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore rimessa in coda";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
