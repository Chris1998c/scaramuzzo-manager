// app/api/cassa/close-session/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  salon_id?: number; // required for coordinator/magazzino; ignored for reception (forced)
  closing_cash?: number; // optional (default 0)
  notes?: string | null; // optional
};

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as any).message);
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
}

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toMoney(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(0, Math.min(n, 1_000_000));
  return Math.round(clamped * 100) / 100;
}

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function sumSalesByRange(args: {
  salonId: number;
  startIso: string;
  endIso: string;
}): Promise<{ gross: number; cash: number; card: number; count: number }> {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select("total_amount, payment_method")
    .eq("salon_id", args.salonId)
    .gte("date", args.startIso)
    .lte("date", args.endIso);

  if (error || !Array.isArray(data)) return { gross: 0, cash: 0, card: 0, count: 0 };

  let gross = 0;
  let cash = 0;
  let card = 0;

  for (const s of data as any[]) {
    const amt = Number(s?.total_amount) || 0;
    gross += amt;
    if (s?.payment_method === "cash") cash += amt;
    if (s?.payment_method === "card") card += amt;
  }

  return {
    gross: round2(gross),
    cash: round2(cash),
    card: round2(card),
    count: data.length,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userId = authData.user.id;
    const access = await getUserAccess();
    const role = access.role;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({} as Body))) as Body;

    // salon_id:
    // - reception: forced from staff.user_id
    // - coordinator/magazzino: required in body
    let salonId = toInt(body?.salon_id);

    if (role === "reception") {
      const sid = access.staffSalonId;
      if (!sid) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 }
        );
      }
      salonId = sid; // hard force
    }

    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "salon_id missing/invalid" }, { status: 400 });
    }

    // AUTHZ salone per coordinator/magazzino
    if (role !== "reception" && !access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json(
        { error: "salon_id non consentito per questo utente" },
        { status: 403 },
      );
    }

    // validate salon exists
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("id, name")
      .eq("id", salonId)
      .maybeSingle();

    if (salonErr) return NextResponse.json({ error: salonErr.message }, { status: 500 });
    if (!salonRow) return NextResponse.json({ error: "Salone non trovato" }, { status: 404 });

    // latest open session
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("cash_sessions")
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
      )
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

    if (!session) {
      return NextResponse.json({ error: "Nessuna cassa aperta per questo salone" }, { status: 400 });
    }

    const sessionId = (session as any).id as number | bigint;
    const cashSessionId =
      typeof sessionId === "bigint" ? Number(sessionId) : Number(sessionId);

    const nowIso = new Date().toISOString();
    const openedAt = String((session as any).opened_at || nowIso);

    const closingCash = toMoney((body as any)?.closing_cash);
    const notesRaw = typeof body?.notes === "string" ? body.notes.trim() : "";
    const pNotes = notesRaw.length > 0 ? notesRaw : null;

    const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("close_cash_session_atomic", {
      p_cash_session_id: cashSessionId,
      p_salon_id: salonId,
      p_user_id: userId,
      p_closing_cash: closingCash,
      p_notes: pNotes,
    });

    if (rpcErr) {
      const msg = rpcErr.message ?? "";
      if (msg.includes("ricevute fiscali non completate")) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      if (msg.includes("sessione non trovata") || msg.includes("salon")) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const rpcRow =
      Array.isArray(rpcRows) && rpcRows.length > 0
        ? (rpcRows[0] as {
            cash_session_id: number;
            z_job_id: number | null;
            closed_at: string;
            already_closed: boolean;
          })
        : null;

    if (!rpcRow) {
      return NextResponse.json({ error: "Risposta RPC vuota" }, { status: 500 });
    }

    const { data: fullSession, error: fsErr } = await supabaseAdmin
      .from("cash_sessions")
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
      )
      .eq("id", rpcRow.cash_session_id)
      .maybeSingle();

    if (fsErr || !fullSession) {
      return NextResponse.json(
        { error: fsErr?.message ?? "Sessione non recuperabile dopo RPC" },
        { status: 500 }
      );
    }

    const closedAtIso = String((fullSession as any).closed_at ?? rpcRow.closed_at);
    const openedAtForTotals = String((fullSession as any).opened_at ?? openedAt);
    const totalsOut = await sumSalesByRange({
      salonId,
      startIso: openedAtForTotals,
      endIso: closedAtIso,
    });

    let fiscalJob: any | null = null;
    let fiscalWarning: string | null = null;

    if (rpcRow.already_closed) {
      return NextResponse.json({
        ok: true,
        already_closed: true,
        salon: { id: (salonRow as any).id, name: (salonRow as any).name ?? null },
        session: fullSession,
        totals: {
          session_gross: totalsOut.gross,
          session_cash: totalsOut.cash,
          session_card: totalsOut.card,
          session_count_sales: totalsOut.count,
        },
        fiscal_job: null,
        fiscal_warning: null,
      });
    }

    if (rpcRow.z_job_id != null) {
      const { data: fj } = await supabaseAdmin
        .from("fiscal_print_jobs")
        .select()
        .eq("id", rpcRow.z_job_id)
        .maybeSingle();
      fiscalJob = fj ?? null;
    } else {
      fiscalWarning = "Fiscal profile non trovato per il salone; Z non richiesta";
    }

    return NextResponse.json({
      ok: true,
      salon: { id: (salonRow as any).id, name: (salonRow as any).name ?? null },
      session: fullSession,
      totals: {
        session_gross: totalsOut.gross,
        session_cash: totalsOut.cash,
        session_card: totalsOut.card,
        session_count_sales: totalsOut.count,
      },
      fiscal_job: fiscalJob,
      fiscal_warning: fiscalWarning,
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
