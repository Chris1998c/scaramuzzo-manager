// POST /api/cassa/admin-close-session
// Chiusura amministrativa: closing_cash resta NULL, nessun z_report.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  cash_session_id?: number | string;
  reason?: string;
};

function parseId(raw: unknown): number | null {
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
    if (access.role !== "coordinator") {
      return NextResponse.json(
        { error: "Solo coordinator può chiudere amministrativamente una sessione cassa." },
        { status: 403 },
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const cashSessionId = parseId(body.cash_session_id);
    if (cashSessionId == null) {
      return NextResponse.json(
        { error: "cash_session_id obbligatorio e valido" },
        { status: 400 },
      );
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10) {
      return NextResponse.json(
        { error: "Motivazione obbligatoria (minimo 10 caratteri)." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("admin_close_cash_session", {
      p_cash_session_id: cashSessionId,
      p_reason: reason,
    });

    if (error) {
      const msg = error.message ?? "Errore chiusura amministrativa";
      if (/autenticazione|solo coordinator|accesso negato/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 403 });
      }
      if (/non trovata|non chiudibile|motivazione/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
    if (!row || typeof row !== "object") {
      return NextResponse.json(
        { error: "Risposta RPC vuota" },
        { status: 500 },
      );
    }

    const rpc = row as {
      cash_session_id: number;
      closed_at: string;
      already_closed: boolean;
    };

    const { data: session, error: sessErr } = await supabase
      .from("cash_sessions")
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_at, closed_at, closed_by, notes",
      )
      .eq("id", rpc.cash_session_id)
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json(
        { error: sessErr?.message ?? "Sessione non recuperabile dopo chiusura" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      already_closed: rpc.already_closed === true,
      session,
      fiscal_job: null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore chiusura amministrativa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
