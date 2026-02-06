// app/api/agenda/close-appointment/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNumber(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

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

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // BODY
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const appointmentId = toNumber(body.appointment_id ?? body.id, NaN);
    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      return NextResponse.json({ error: "appointment_id invalid" }, { status: 400 });
    }

    // LOAD APPOINTMENT (ADMIN)
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, status, sale_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // if already closed
    if (appt.status === "done") {
      return NextResponse.json(
        { ok: true, appointment_id: appointmentId, already_closed: true, sale_id: appt.sale_id ?? null },
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

    return NextResponse.json({ ok: true, appointment_id: appointmentId });
  } catch (e) {
    return NextResponse.json(
      { error: "Errore /api/agenda/close-appointment", details: errMsg(e) },
      { status: 500 }
    );
  }
}
