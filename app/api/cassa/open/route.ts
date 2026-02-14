// app/api/cassa/open/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRole = "reception" | "coordinator" | "magazzino";

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

    const body = await req.json().catch(() => ({} as any));

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

    // validate salon exists (cheap)
    const { data: salonRow, error: salonErr } = await supabaseAdmin
      .from("salons")
      .select("id")
      .eq("id", salonId)
      .maybeSingle();

    if (salonErr) return NextResponse.json({ error: salonErr.message }, { status: 500 });
    if (!salonRow) return NextResponse.json({ error: "Salone non trovato" }, { status: 404 });

    const openingCash = toMoney(body?.opening_cash);
    const sessionDate = todayRomeISO();

    // Idempotent: if already open, reuse it
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("cash_sessions")
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
      )
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (existing) {
      // if it's open but opening_cash is 0 and caller sends >0, we can upgrade once (enterprise UX)
      const existingOpening = Number((existing as any).opening_cash) || 0;
      if (openingCash > 0 && existingOpening === 0) {
        const { data: patched, error: patchErr } = await supabaseAdmin
          .from("cash_sessions")
          .update({ opening_cash: openingCash })
          .eq("id", (existing as any).id)
          .select(
            "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
          )
          .single();

        if (!patchErr && patched) {
          return NextResponse.json({ ok: true, session: patched, reused: true, updated_opening_cash: true });
        }
      }

      return NextResponse.json({ ok: true, session: existing, reused: true });
    }

    // Create open session
    const now = new Date().toISOString();

    const { data: created, error: crErr } = await supabaseAdmin
      .from("cash_sessions")
      .insert({
        salon_id: salonId,
        session_date: sessionDate,
        opened_by: userId,
        opening_cash: openingCash,
        status: "open",
        opened_at: now,
      })
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes"
      )
      .single();

    if (crErr || !created) {
      return NextResponse.json({ error: crErr?.message ?? "Errore apertura cassa" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session: created, reused: false });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
