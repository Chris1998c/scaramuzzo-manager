// app/api/cassa/void-fiscal/route.ts
// MVP: accoda job void_receipt per vendita già stampata (solo coordinator).
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoidFiscalBody = {
  sale_id?: number | string;
  reason?: string;
};

type VoidRpcRow = {
  job_id: number | string | null;
  sale_id: number | string | null;
};

function toSaleId(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Errore server";
}

function mapRpcError(message: string): number {
  const m = message.toLowerCase();
  if (/non trovata|non trovato/.test(m)) return 404;
  if (
    /già presente|non annullabile|non stampata|coordinate complete|impossibile aggiornare/.test(
      m,
    )
  ) {
    return 409;
  }
  if (/richiesto|richiesta/.test(m)) return 400;
  return 500;
}

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

    let body: VoidFiscalBody;
    try {
      body = (await req.json()) as VoidFiscalBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const saleId = toSaleId(body.sale_id);
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (saleId == null) {
      return NextResponse.json(
        { error: "sale_id obbligatorio e valido" },
        { status: 400 },
      );
    }

    if (!reason) {
      return NextResponse.json(
        { error: "reason obbligatorio" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("create_void_receipt_job_atomic", {
      p_sale_id: saleId,
      p_user_id: authData.user.id,
      p_reason: reason,
    });

    if (error) {
      const msg = error.message ?? "Errore creazione annullo fiscale";
      return NextResponse.json({ error: msg }, { status: mapRpcError(msg) });
    }

    const row = (
      Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
    ) as VoidRpcRow | null;

    const jobId = toSaleId(row?.job_id);
    const outSaleId = toSaleId(row?.sale_id) ?? saleId;

    if (jobId == null) {
      return NextResponse.json(
        { error: "Job annullo non restituito dalla RPC" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      sale_id: outSaleId,
    });
  } catch (e) {
    console.error("POST /api/cassa/void-fiscal", e);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
