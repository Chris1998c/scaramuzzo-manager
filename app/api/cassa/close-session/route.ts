// app/api/cassa/close-session/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRole = "reception" | "coordinator" | "magazzino";

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

function roleFromMetadata(user: any): string {
  return String(user?.user_metadata?.role ?? user?.app_metadata?.role ?? "").trim();
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const roleName = (data as any)?.roles?.name;
  return roleName ? String(roleName).trim() : null;
}

async function getReceptionSalonId(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("salon_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const sid = toInt((data as any)?.salon_id);
  return sid && sid > 0 ? sid : null;
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

    const user = authData.user;
    const userId = user.id;

    // ROLE (DB source-of-truth, fallback metadata)
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(user)) as StaffRole;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({} as Body))) as Body;

    // salon_id:
    // - reception: forced from staff.user_id
    // - coordinator/magazzino: required in body
    let salonId = toInt(body?.salon_id);

    if (role === "reception") {
      const sid = await getReceptionSalonId(userId);
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

    // idempotenza: se per qualche motivo closed_at è già valorizzato (race), trattiamo come già chiusa
    if ((session as any).closed_at) {
      return NextResponse.json({ ok: true, already_closed: true, session }, { status: 200 });
    }

    const nowIso = new Date().toISOString();
    const openedAt = String((session as any).opened_at || nowIso);

    // Totali sessione: opened_at -> now
    const totals = await sumSalesByRange({
      salonId,
      startIso: openedAt,
      endIso: nowIso,
    });

    // closing_cash e note
    const closingCash = toMoney((body as any)?.closing_cash);
    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    const patch: any = {
      closing_cash: closingCash,
      status: "closed",
      closed_by: userId,
      closed_at: nowIso,
    };

    if (notes) patch.notes = notes;

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("cash_sessions")
      .update(patch)
      .eq("id", (session as any).id)
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
      )
      .single();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      salon: { id: (salonRow as any).id, name: (salonRow as any).name ?? null },
      session: updated,
      totals: {
        session_gross: totals.gross,
        session_cash: totals.cash,
        session_card: totals.card,
        session_count_sales: totals.count,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
