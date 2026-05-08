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

type PatchBody = Partial<{
  customer_id: string | number | null;
  notes: string | null;
  start_time: string;
  end_time: string;
  staff_id: number | null;
}>;

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
  ctx: { params: Promise<{ id: string }> }
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

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, start_time, end_time, staff_id")
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

    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const metaPatch: Record<string, unknown> = {};
    if (body.customer_id !== undefined) {
      if (body.customer_id === null || String(body.customer_id).trim() === "") {
        return NextResponse.json({ error: "customer_id non valido" }, { status: 400 });
      }
      metaPatch.customer_id = String(body.customer_id).trim();
    }
    if (body.notes !== undefined) {
      metaPatch.notes = body.notes == null || String(body.notes).trim() === "" ? null : String(body.notes).trim();
    }

    const oldStart = parseLocal(String((appt as { start_time?: string }).start_time ?? ""));
    const oldEnd = (appt as { end_time?: string | null }).end_time
      ? parseLocal(String((appt as { end_time?: string | null }).end_time))
      : new Date(oldStart.getTime() + clampDurationMinutes(30) * 60_000);

    const hasStartInput = body.start_time !== undefined;
    const hasEndInput = body.end_time !== undefined;
    const hasStaffInput = body.staff_id !== undefined;
    const newStart = hasStartInput
      ? snapToAgendaSlot(parseLocal(String(body.start_time)))
      : oldStart;
    const newEndInput = hasEndInput
      ? snapToAgendaSlot(parseLocal(String(body.end_time)))
      : null;
    const staffNorm =
      hasStaffInput
        ? normalizeStaffId(body.staff_id)
        : normalizeStaffId((appt as { staff_id?: unknown }).staff_id);

    const deltaMs = newStart.getTime() - oldStart.getTime();
    const timeChanged = hasStartInput && deltaMs !== 0;
    const staffChanged = hasStaffInput && staffNorm !== normalizeStaffId((appt as { staff_id?: unknown }).staff_id);

    if (Object.keys(metaPatch).length) {
      const { error: metaErr } = await supabaseAdmin
        .from("appointments")
        .update(metaPatch)
        .eq("id", appointmentId);
      if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
    }

    const { data: lineRows, error: linesErr } = await supabaseAdmin
      .from("appointment_services")
      .select("id, start_time")
      .eq("appointment_id", appointmentId)
      .order("start_time", { ascending: true })
      .order("id", { ascending: true });
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

    if (lineRows?.length) {
      if (timeChanged || staffChanged) {
        for (const l of lineRows) {
          const patch: Record<string, unknown> = {};
          if (staffChanged) patch.staff_id = staffNorm;
          if (timeChanged) {
            const ls = parseLocal(String((l as { start_time?: string }).start_time ?? ""));
            patch.start_time = toNoZ(snapToAgendaSlot(new Date(ls.getTime() + deltaMs)));
          }
          if (!Object.keys(patch).length) continue;
          const { error: uErr } = await supabaseAdmin
            .from("appointment_services")
            .update(patch)
            .eq("id", (l as { id: number }).id);
          if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
        }
      }

      const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
      if (!synced.ok) return NextResponse.json({ error: synced.error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const headerPatch: Record<string, unknown> = {};
    if (timeChanged) {
      headerPatch.start_time = toNoZ(newStart);
      if (newEndInput) {
        headerPatch.end_time = toNoZ(newEndInput);
      } else {
        const durationMs = Math.max(clampDurationMinutes(15) * 60_000, oldEnd.getTime() - oldStart.getTime());
        headerPatch.end_time = toNoZ(snapToAgendaSlot(new Date(newStart.getTime() + durationMs)));
      }
    } else if (newEndInput) {
      headerPatch.end_time = toNoZ(newEndInput);
    }
    if (staffChanged) headerPatch.staff_id = staffNorm;

    if (Object.keys(headerPatch).length) {
      const { error: hErr } = await supabaseAdmin
        .from("appointments")
        .update(headerPatch)
        .eq("id", appointmentId);
      if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Errore /api/agenda/appointments/[id]", details: errMsg(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
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

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id")
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

    const { error: delLinesErr } = await supabaseAdmin
      .from("appointment_services")
      .delete()
      .eq("appointment_id", appointmentId);
    if (delLinesErr) return NextResponse.json({ error: delLinesErr.message }, { status: 500 });

    const { error: delAppErr } = await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("id", appointmentId);
    if (delAppErr) return NextResponse.json({ error: delAppErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Errore DELETE /api/agenda/appointments/[id]", details: errMsg(e) },
      { status: 500 }
    );
  }
}
