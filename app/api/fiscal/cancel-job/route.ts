import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { fetchFiscalPrintJobById } from "@/lib/fiscal/fetchFiscalPrintJobById";
import {
  assertSalonAccessForFiscalJob,
  requireFiscalJobActor,
} from "@/lib/fiscal/fiscalJobActionAuth";
import { cancelFiscalPrintJobViaRpc } from "@/lib/fiscal/cancelFiscalPrintJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CancelBody = {
  job_id?: number | string;
  confirm_z_report?: boolean;
  reason?: string;
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

    let body: CancelBody;
    try {
      body = (await req.json()) as CancelBody;
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

    if (job.kind === "z_report" && body.confirm_z_report !== true) {
      return NextResponse.json(
        {
          error:
            "Conferma esplicita richiesta per annullare job z_report (confirm_z_report).",
        },
        { status: 400 },
      );
    }

    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "dashboard";

    const result = await cancelFiscalPrintJobViaRpc(jobId, reason);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message },
        { status: result.status },
      );
    }

    return NextResponse.json({ ok: true, job: result.job });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore annullamento";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
