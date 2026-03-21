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

function isTerminalJobStatus(status: string): boolean {
  const u = status.trim().toLowerCase();
  return u === "completed" || u === "failed";
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

  if (isTerminalJobStatus(row.status)) {
    return NextResponse.json({ ok: true, already_finalized: true }, { status: 200 });
  }

  const newJobStatus = ok ? "completed" : "failed";

  const { error: jobUpErr } = await supabaseAdmin
    .from("fiscal_print_jobs")
    .update({ status: newJobStatus })
    .eq("id", jobId);

  if (jobUpErr) {
    return NextResponse.json(
      { error: jobUpErr.message ?? "Errore aggiornamento job" },
      { status: 500 },
    );
  }

  if (row.kind !== "sale_receipt") {
    return NextResponse.json({ ok: true, sale_updated: false });
  }

  const payload = row.payload as { sale_id?: unknown } | null;
  const saleIdRaw = payload?.sale_id;
  const saleId =
    typeof saleIdRaw === "number"
      ? saleIdRaw
      : typeof saleIdRaw === "string"
        ? Number(saleIdRaw)
        : NaN;

  if (!Number.isFinite(saleId) || saleId <= 0) {
    return NextResponse.json({ ok: true, sale_updated: false });
  }

  const { data: sale, error: saleErr } = await supabaseAdmin
    .from("sales")
    .select("id, salon_id, fiscal_status")
    .eq("id", saleId)
    .maybeSingle();

  if (saleErr || !sale) {
    return NextResponse.json({ error: "Vendita non trovata" }, { status: 404 });
  }

  const s = sale as { id: number; salon_id: number; fiscal_status: string };
  if (s.salon_id !== row.salon_id) {
    return NextResponse.json({ error: "sale_id non coerente col job" }, { status: 400 });
  }

  if (String(s.fiscal_status) !== "queued") {
    return NextResponse.json({ ok: true, sale_updated: false, skipped: "not_queued" });
  }

  const newSaleStatus = ok ? "printed" : "error";
  const { error: upErr } = await supabaseAdmin
    .from("sales")
    .update({ fiscal_status: newSaleStatus })
    .eq("id", saleId)
    .eq("fiscal_status", "queued");

  if (upErr) {
    return NextResponse.json({ error: upErr.message ?? "Errore aggiornamento vendita" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sale_updated: true, fiscal_status: newSaleStatus });
}
