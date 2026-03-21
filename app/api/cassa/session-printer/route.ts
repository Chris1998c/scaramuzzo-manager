// app/api/cassa/session-printer/route.ts
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

function roleFromMetadata(user: { user_metadata?: unknown; app_metadata?: unknown }) {
  return String(
    (user as any)?.user_metadata?.role ?? (user as any)?.app_metadata?.role ?? "",
  ).trim();
}

async function getStaffInfo(userId: string): Promise<{
  role: string | null;
  salonId: number | null;
}> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("role, salon_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { role: null, salonId: null };

  const role = (data as { role?: unknown }).role
    ? String((data as { role?: unknown }).role).trim()
    : null;
  const sid = toInt((data as { salon_id?: unknown }).salon_id, NaN);
  const salonId = Number.isFinite(sid) && sid > 0 ? sid : null;
  return { role, salonId };
}

async function getAllowedSalonIds(userId: string): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("user_salons")
    .select("salon_id")
    .eq("user_id", userId);

  if (error || !Array.isArray(data)) return [];

  return (data as { salon_id?: unknown }[])
    .map((row) => toInt(row.salon_id, NaN))
    .filter((id) => Number.isFinite(id) && id > 0) as number[];
}

export async function PATCH(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userId = authData.user.id;
    const staffInfo = await getStaffInfo(userId);
    const role = (staffInfo.role || roleFromMetadata(authData.user)) as StaffRole;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    let salonId = toInt(body?.salon_id, NaN);

    if (role === "reception") {
      const sid = staffInfo.salonId;
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

    if (role !== "reception") {
      const allowed = await getAllowedSalonIds(userId);
      if (!allowed.length || !allowed.includes(salonId)) {
        return NextResponse.json(
          { error: "salon_id non consentito per questo utente" },
          { status: 403 },
        );
      }
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
