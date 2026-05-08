// app/api/fiscal/bridge-callback/route.ts
// Print Bridge (o worker) chiama POST con header x-fiscal-callback-secret = FISCAL_BRIDGE_CALLBACK_SECRET.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobRow = {
  id: number;
  salon_id: number;
  kind: string;
  payload: unknown;
  status: string;
};

type FinalizeFiscalRpcRow = {
  ok: boolean;
  already_finalized: boolean;
  sale_updated: boolean;
  new_job_status: string | null;
  new_sale_status: string | null;
  skipped_reason: string | null;
};

function parseOutcome(body: Record<string, unknown> | null): boolean | null {
  if (!body) return null;
  if (body.success === true) return true;
  if (body.success === false) return false;
  const s = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  if (s(body.status) === "completed" || s(body.result) === "ok") return true;
  if (s(body.status) === "failed" || s(body.result) === "error") return false;
  return null;
}

function readSecret(req: Request): string | null {
  const h = req.headers.get("x-fiscal-callback-secret")?.trim();
  if (h) return h;
  const auth = req.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export async function POST(req: Request) {
  const expected = process.env.FISCAL_BRIDGE_CALLBACK_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Callback non configurato (FISCAL_BRIDGE_CALLBACK_SECRET)" },
      { status: 503 },
    );
  }

  if (readSecret(req) !== expected) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const jobIdRaw = body?.job_id;
  const jobId =
    typeof jobIdRaw === "number"
      ? jobIdRaw
      : typeof jobIdRaw === "string"
        ? Number(jobIdRaw)
        : NaN;

  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: "job_id obbligatorio e valido" }, { status: 400 });
  }

  const ok = parseOutcome(body);
  if (ok === null) {
    return NextResponse.json(
      { error: "Esito richiesto: success (boolean) oppure status/result" },
      { status: 400 },
    );
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .select("id, salon_id, kind, payload, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job non trovato" }, { status: 404 });
  }

  const row = job as JobRow;
  const callbackError =
    typeof body?.error_message === "string"
      ? body.error_message
      : typeof body?.error === "string"
        ? body.error
        : null;

  const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("finalize_fiscal_job_atomic", {
    p_job_id: row.id,
    p_success: ok,
    p_error_message: callbackError,
  });

  if (rpcErr) {
    return NextResponse.json(
      { error: rpcErr.message ?? "Errore finalizzazione fiscale" },
      { status: 500 },
    );
  }

  const out = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as FinalizeFiscalRpcRow | null)
    : ((rpcData ?? null) as FinalizeFiscalRpcRow | null);

  if (!out) {
    return NextResponse.json({ error: "Risposta RPC non valida" }, { status: 500 });
  }

  if (!out.ok && out.skipped_reason === "job_not_found") {
    return NextResponse.json({ error: "Job non trovato" }, { status: 404 });
  }

  if (!out.ok) {
    return NextResponse.json(
      { error: out.skipped_reason ?? "Finalizzazione fiscale non riuscita" },
      { status: 500 },
    );
  }

  const response: Record<string, unknown> = {
    ok: true,
    already_finalized: !!out.already_finalized,
    sale_updated: !!out.sale_updated,
  };

  if (out.new_sale_status) {
    response.fiscal_status = out.new_sale_status;
  }
  if (out.skipped_reason) {
    response.skipped = out.skipped_reason;
  }

  return NextResponse.json(response, { status: 200 });
}
