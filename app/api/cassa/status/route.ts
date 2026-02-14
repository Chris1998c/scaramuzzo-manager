// app/api/cassa/status/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRole = "reception" | "coordinator" | "magazzino";

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e)
    return String((e as any).message);
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

function roleFromMetadata(user: any): string {
  return String(
    user?.user_metadata?.role ?? user?.app_metadata?.role ?? "",
  ).trim();
}

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function todayRomeISO(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  // source-of-truth: users -> roles
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

  if (error || !Array.isArray(data)) {
    return { gross: 0, cash: 0, card: 0, count: 0 };
  }

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

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const user = authData.user;
    const userId = user.id;

    // ROLE (DB as source-of-truth, fallback metadata)
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(user)) as StaffRole;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // salon_id:
    // - reception: forced from staff.user_id
    // - coordinator/magazzino: ?salon_id= required
    const url = new URL(req.url);
    const qSalon = toInt(url.searchParams.get("salon_id"));
    let salonId: number | null = qSalon;

    if (role === "reception") {
      const sid = await getReceptionSalonId(userId);
      if (!sid) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 },
        );
      }
      salonId = sid;
    }

    if (!salonId || salonId <= 0) {
      return NextResponse.json(
        { error: "salon_id missing/invalid" },
        { status: 400 },
      );
    }

    // Validate salon exists (and return name)
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("id, name")
      .eq("id", salonId)
      .maybeSingle();

    if (salonErr)
      return NextResponse.json({ error: salonErr.message }, { status: 500 });
    if (!salonRow)
      return NextResponse.json(
        { error: "Salone non trovato" },
        { status: 404 },
      );

    // Latest open session (if any)
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("cash_sessions")
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes",
      )
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr)
      return NextResponse.json({ error: sessErr.message }, { status: 500 });

    const nowIso = new Date().toISOString();
    const today = todayRomeISO();

    // Totals:
    // - today_*: range today (Europe/Rome) for quick UI
    // - session_*: range from opened_at -> now (real session totals, enterprise)
    // Totals:
    // - today_*: sempre (anche se cassa chiusa) per UI
    // - session_*: solo se esiste una sessione aperta
    // Totals:
    // - today_*: sempre (anche se cassa chiusa) per UI
    // - session_*: solo se esiste una sessione aperta
    let totals: null | {
      day: string;
      today_gross: number;
      today_cash: number;
      today_card: number;
      today_count_sales: number;
      session_gross: number;
      session_cash: number;
      session_card: number;
      session_count_sales: number;
    } = null;

    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59.999`;

    // oggi SEMPRE
    const tDay = await sumSalesByRange({
      salonId,
      startIso: todayStart,
      endIso: todayEnd,
    });

    // sessione SOLO se cassa aperta
    let tSess = { gross: 0, cash: 0, card: 0, count: 0 };
    if (session) {
      tSess = await sumSalesByRange({
        salonId,
        startIso: String((session as any).opened_at ?? todayStart),
        endIso: nowIso,
      });
    }

    totals = {
      day: today,
      today_gross: tDay.gross,
      today_cash: tDay.cash,
      today_card: tDay.card,
      today_count_sales: tDay.count,
      session_gross: tSess.gross,
      session_cash: tSess.cash,
      session_card: tSess.card,
      session_count_sales: tSess.count,
    };

    return NextResponse.json({
      ok: true,
      role,
      salon: { id: (salonRow as any).id, name: (salonRow as any).name ?? null },
      is_open: Boolean(session),
      session: session ?? null,
      totals,
    });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
