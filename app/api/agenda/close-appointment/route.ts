// app/api/agenda/close-appointment/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRole = "reception" | "coordinator" | "magazzino";

function errMsg(e: unknown): string {
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

    // BODY
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const appointmentId = toInt(body.appointment_id ?? body.id);
    if (!appointmentId || appointmentId <= 0) {
      return NextResponse.json({ error: "appointment_id invalid" }, { status: 400 });
    }

    // LOAD APPOINTMENT (ADMIN)
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, status, sale_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const salonId = toInt((appt as any).salon_id);
    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "appointment salon_id invalid" }, { status: 500 });
    }

    // AUTHZ: reception solo sul proprio salone
    if (role === "reception") {
      const mySalonId = await getReceptionSalonId(userId);
      if (!mySalonId) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 }
        );
      }
      if (salonId !== mySalonId) {
        return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
      }
    }

    // Idempotente
    if ((appt as any).status === "done") {
      return NextResponse.json(
        {
          ok: true,
          appointment_id: appointmentId,
          already_closed: true,
          sale_id: (appt as any).sale_id ?? null,
        },
        { status: 200 }
      );
    }

    // CLOSE only (no sales creation)
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: "done" })
      .eq("id", appointmentId);

    if (updErr) {
      return NextResponse.json(
        { error: "Appointment close failed", details: errMsg(updErr) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      appointment_id: appointmentId,
      sale_id: (appt as any).sale_id ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Errore /api/agenda/close-appointment", details: errMsg(e) },
      { status: 500 }
    );
  }
}
