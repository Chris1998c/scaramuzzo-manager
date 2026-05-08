import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  clampDurationMinutes,
  normalizeStaffId,
  parseLocal,
  snapToAgendaSlot,
  syncAppointmentHeaderFromDb,
  toNoZ,
} from "@/lib/agenda/agendaContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  start_time?: string;
  duration_minutes?: number;
  staff_id?: number | null;
};

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function errMsg(e: unknown): string {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message);
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ lineId: string }> }
) {
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

    const { lineId: lineIdRaw } = await ctx.params;
    const lineId = toInt(lineIdRaw);
    if (!lineId || lineId <= 0) {
      return NextResponse.json({ error: "lineId non valido" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const clean: Record<string, unknown> = {};
    if (body.start_time !== undefined) {
      clean.start_time = toNoZ(snapToAgendaSlot(parseLocal(String(body.start_time))));
    }
    if (body.duration_minutes !== undefined) {
      clean.duration_minutes = clampDurationMinutes(body.duration_minutes);
    }
    if (body.staff_id !== undefined) {
      clean.staff_id = normalizeStaffId(body.staff_id);
    }
    if (!Object.keys(clean).length) return NextResponse.json({ ok: true });

    const { data: lineRow, error: lineErr } = await supabaseAdmin
      .from("appointment_services")
      .select("id, appointment_id, appointments:appointment_id ( salon_id )")
      .eq("id", lineId)
      .maybeSingle();

    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
    if (!lineRow) return NextResponse.json({ error: "Riga non trovata" }, { status: 404 });

    const appointmentId = toInt((lineRow as { appointment_id?: unknown }).appointment_id);
    const appt = (lineRow as { appointments?: { salon_id?: unknown } | { salon_id?: unknown }[] }).appointments;
    const apptObj = Array.isArray(appt) ? appt[0] : appt;
    const salonId = toInt(apptObj?.salon_id);
    if (!appointmentId || !salonId) {
      return NextResponse.json({ error: "Riga agenda non valida" }, { status: 500 });
    }

    if (role === "reception") {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || salonId !== mySalonId) {
        return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
      }
    } else if (!access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
    }

    const { data: updatedRows, error: updErr } = await supabaseAdmin
      .from("appointment_services")
      .update(clean)
      .eq("id", lineId)
      .select("id");
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!updatedRows?.length) {
      return NextResponse.json({ error: "Update non applicato" }, { status: 404 });
    }

    const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Errore /api/agenda/lines/[lineId]", details: errMsg(e) },
      { status: 500 }
    );
  }
}
