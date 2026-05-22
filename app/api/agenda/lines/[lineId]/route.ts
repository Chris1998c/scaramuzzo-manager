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
import { assertStaffBelongsToSalon } from "@/lib/agenda/appointmentServerValidation";
import {
  assertStaffScheduledForStartTime,
  isoDateFromAgendaStartTime,
  isStaffScheduleConflictError,
} from "@/lib/agenda/assertStaffSchedule";
import { fetchOperationalCalendarSnapshot } from "@/lib/salonOperationalCalendar";
import {
  assertStaffSlotFree,
  computeLineEndTime,
  isStaffSlotConflictFromDbError,
  isStaffSlotConflictOrDbError,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import { canModifyAppointmentAgendaLine } from "@/lib/agenda/appointmentLifecycle";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";

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
    const { data: lineRow, error: lineErr } = await supabaseAdmin
      .from("appointment_services")
      .select(
        "id, appointment_id, start_time, duration_minutes, staff_id, appointments:appointment_id ( salon_id, status, sale_id )",
      )
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

    const lineMutable = canModifyAppointmentAgendaLine({
      status: (apptObj as { status?: unknown })?.status,
      sale_id: (apptObj as { sale_id?: unknown })?.sale_id,
    });
    if (!lineMutable.allowed) {
      return NextResponse.json({ error: lineMutable.error }, { status: 409 });
    }

    if (body.staff_id !== undefined) {
      const staffId = normalizeStaffId(body.staff_id);
      const staffGate = await assertStaffBelongsToSalon(supabaseAdmin, staffId, salonId);
      if (!staffGate.ok) {
        return NextResponse.json({ error: staffGate.error }, { status: staffGate.status });
      }
      clean.staff_id = staffId;
    }

    if (!Object.keys(clean).length) return NextResponse.json({ ok: true });

    const currentStart = String((lineRow as { start_time?: unknown }).start_time ?? "");
    const currentDuration = Number((lineRow as { duration_minutes?: unknown }).duration_minutes);
    const mergedStart =
      clean.start_time !== undefined ? String(clean.start_time) : currentStart;
    const mergedDuration =
      clean.duration_minutes !== undefined
        ? Number(clean.duration_minutes)
        : currentDuration;
    const mergedStaff =
      clean.staff_id !== undefined
        ? (clean.staff_id as number | null)
        : normalizeStaffId((lineRow as { staff_id?: unknown }).staff_id);

    if (mergedStaff != null && mergedStart && Number.isFinite(mergedDuration) && mergedDuration > 0) {
      const scheduleMap = await fetchStaffScheduleForSalon(supabaseAdmin, salonId);
      const opIsoDate = isoDateFromAgendaStartTime(mergedStart);
      const operationalSnapshot =
        opIsoDate != null
          ? await fetchOperationalCalendarSnapshot(supabaseAdmin, salonId, opIsoDate, [
              mergedStaff,
            ])
          : undefined;
      await assertStaffScheduledForStartTime({
        supabase: supabaseAdmin,
        salonId,
        staffId: mergedStaff,
        startTime: mergedStart,
        durationMinutes: mergedDuration,
        scheduleMap,
        operationalSnapshot,
        operationalIsoDate: opIsoDate ?? undefined,
      });
      const lineEnd = computeLineEndTime(mergedStart, mergedDuration);
      await assertStaffSlotFree({
        supabase: supabaseAdmin,
        salonId,
        staffId: mergedStaff,
        startTime: mergedStart,
        endTime: lineEnd,
        excludeAppointmentId: appointmentId,
        excludeLineId: lineId,
      });
    }

    const { data: updatedRows, error: updErr } = await supabaseAdmin
      .from("appointment_services")
      .update(clean)
      .eq("id", lineId)
      .select("id");
    if (updErr) {
      if (isStaffSlotConflictFromDbError(updErr)) {
        return NextResponse.json({ error: STAFF_SLOT_CONFLICT_MESSAGE }, { status: 409 });
      }
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updatedRows?.length) {
      return NextResponse.json({ error: "Update non applicato" }, { status: 404 });
    }

    const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isStaffScheduleConflictError(e) || isStaffSlotConflictOrDbError(e)) {
      return NextResponse.json(
        {
          error: isStaffSlotConflictOrDbError(e)
            ? STAFF_SLOT_CONFLICT_MESSAGE
            : (e as Error).message,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Errore /api/agenda/lines/[lineId]", details: errMsg(e) },
      { status: 500 }
    );
  }
}
