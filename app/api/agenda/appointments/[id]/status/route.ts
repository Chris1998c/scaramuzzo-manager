import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  canSetAppointmentLifecycleStatus,
  type AgendaLifecycleTarget,
} from "@/lib/agenda/appointmentLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TARGETS = new Set<AgendaLifecycleTarget>(["cancelled", "no_show"]);

type StatusBody = { status?: string };

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
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

    const { id: idRaw } = await ctx.params;
    const appointmentId = toInt(idRaw);
    if (!appointmentId || appointmentId <= 0) {
      return NextResponse.json({ error: "id appuntamento non valido" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as StatusBody | null;
    const target = String(body?.status ?? "").trim().toLowerCase() as AgendaLifecycleTarget;
    if (!ALLOWED_TARGETS.has(target)) {
      return NextResponse.json(
        { error: "status non valido (cancelled | no_show)" },
        { status: 400 },
      );
    }

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, status, sale_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });
    if (!appt) return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });

    const salonId = toInt((appt as { salon_id?: unknown }).salon_id);
    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "salon_id appuntamento non valido" }, { status: 500 });
    }

    if (role === "reception") {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || salonId !== mySalonId) {
        return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
      }
    } else if (!access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
    }

    const gate = canSetAppointmentLifecycleStatus({
      status: (appt as { status?: unknown }).status,
      sale_id: (appt as { sale_id?: unknown }).sale_id,
      target,
    });

    if (!gate.allowed) {
      return NextResponse.json({ error: gate.reason ?? "Azione non consentita" }, { status: 409 });
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: target })
      .eq("id", appointmentId)
      .select("id, status")
      .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!updated) {
      return NextResponse.json({ error: "Aggiornamento stato non applicato" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, appointment_id: appointmentId, status: target });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore aggiornamento stato";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
