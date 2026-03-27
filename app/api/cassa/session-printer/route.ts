// app/api/cassa/session-printer/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e)
    return String((e as { message?: unknown }).message);
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
}

function toInt(v: unknown, fb = NaN): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const access = await getUserAccess();
    const role = access.role;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    let salonId = toInt(body?.salon_id, NaN);

    if (role === "reception") {
      const sid = access.staffSalonId;
      if (!sid) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 },
        );
      }
      salonId = sid;
    }

    if (!salonId || !Number.isFinite(salonId) || salonId <= 0) {
      return NextResponse.json({ error: "salon_id missing/invalid" }, { status: 400 });
    }

    if (role !== "reception" && !access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json(
        { error: "salon_id non consentito per questo utente" },
        { status: 403 },
      );
    }

    if (typeof body?.printer_enabled !== "boolean") {
      return NextResponse.json(
        { error: "printer_enabled (boolean) richiesto" },
        { status: 400 },
      );
    }

    const { data: session, error: sessErr } = await supabaseAdmin
      .from("cash_sessions")
      .select("id")
      .eq("salon_id", salonId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr) {
      return NextResponse.json({ error: sessErr.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json(
        { error: "Nessuna cassa aperta per questo salone" },
        { status: 400 },
      );
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("cash_sessions")
      .update({ printer_enabled: body.printer_enabled })
      .eq("id", (session as { id: number }).id)
      .select(
        "id, salon_id, session_date, opening_cash, closing_cash, status, opened_by, opened_at, closed_by, closed_at, notes, printer_enabled",
      )
      .single();

    if (updErr || !updated) {
      return NextResponse.json(
        { error: updErr?.message ?? "Aggiornamento fallito" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, session: updated });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
