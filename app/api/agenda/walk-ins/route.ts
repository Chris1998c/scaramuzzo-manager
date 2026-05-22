import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  assertStaffBelongsToSalon,
  resolveAgendaServiceLines,
} from "@/lib/agenda/appointmentServerValidation";
import {
  assertStaffScheduledForStartTime,
  isoDateFromAgendaStartTime,
  isStaffScheduleConflictError,
} from "@/lib/agenda/assertStaffSchedule";
import { fetchOperationalCalendarSnapshot } from "@/lib/salonOperationalCalendar";
import {
  assertBatchInternalStaffSlotsFree,
  assertStaffSlotFree,
  computeLineEndTime,
  isStaffSlotConflictFromDbError,
  isStaffSlotConflictOrDbError,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";
import {
  normalizeStaffId,
  nowRomeLocalDate,
  snapToAgendaSlot,
  syncAppointmentHeaderFromDb,
  toNoZ,
} from "@/lib/agenda/agendaContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WalkInBody = {
  customer_id: string;
  salon_id: number;
  staff_id: number | string;
  service_ids: number[];
  notes?: string | null;
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

export async function POST(req: Request) {
  let appointmentIdCreated: number | null = null;
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

    const body = (await req.json().catch(() => null)) as WalkInBody | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const salonId = toInt(body.salon_id);
    const customerId = String(body.customer_id ?? "").trim();
    const staffId = normalizeStaffId(body.staff_id);
    const serviceIds = Array.isArray(body.service_ids)
      ? [...new Set(body.service_ids.map((id) => toInt(id)).filter((id): id is number => !!id && id > 0))]
      : [];
    const notes =
      body.notes == null || String(body.notes).trim() === "" ? null : String(body.notes).trim();

    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "salon_id non valido" }, { status: 400 });
    }
    if (!customerId) {
      return NextResponse.json({ error: "customer_id non valido" }, { status: 400 });
    }
    if (!staffId) {
      return NextResponse.json({ error: "staff_id non valido" }, { status: 400 });
    }
    if (!serviceIds.length) {
      return NextResponse.json({ error: "Almeno un servizio è obbligatorio" }, { status: 400 });
    }

    if (role === "reception") {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || salonId !== mySalonId) {
        return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
      }
    } else if (!access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
    }

    const staffGate = await assertStaffBelongsToSalon(supabaseAdmin, staffId, salonId);
    if (!staffGate.ok) {
      return NextResponse.json({ error: staffGate.error }, { status: staffGate.status });
    }

    const { data: customerRow, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .maybeSingle();
    if (customerErr) return NextResponse.json({ error: customerErr.message }, { status: 500 });
    if (!customerRow) return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });

    const resolvedServices = await resolveAgendaServiceLines(supabaseAdmin, salonId, serviceIds);
    if (!resolvedServices.ok) {
      return NextResponse.json({ error: resolvedServices.error }, { status: resolvedServices.status });
    }

    const checkedInAt = toNoZ(nowRomeLocalDate());
    const snappedStart = toNoZ(snapToAgendaSlot(nowRomeLocalDate()));

    const scheduleMap = await fetchStaffScheduleForSalon(supabaseAdmin, salonId);
    const opIsoDate = isoDateFromAgendaStartTime(snappedStart);
    const operationalSnapshot =
      opIsoDate != null
        ? await fetchOperationalCalendarSnapshot(supabaseAdmin, salonId, opIsoDate, [staffId])
        : undefined;

    let cursorMs = snapToAgendaSlot(nowRomeLocalDate()).getTime();
    const batchLines: Array<{
      staffId: number | null;
      startTime: string;
      durationMinutes: number;
    }> = [];
    for (const serviceId of serviceIds) {
      const resolved = resolvedServices.data.get(serviceId);
      if (!resolved) continue;
      const lineStart = toNoZ(snapToAgendaSlot(new Date(cursorMs)));
      batchLines.push({
        staffId,
        startTime: lineStart,
        durationMinutes: resolved.duration_minutes,
      });
      cursorMs += resolved.duration_minutes * 60_000;
    }

    try {
      assertBatchInternalStaffSlotsFree(batchLines);
    } catch (e) {
      if (isStaffSlotConflictOrDbError(e)) {
        return NextResponse.json({ error: STAFF_SLOT_CONFLICT_MESSAGE }, { status: 409 });
      }
      throw e;
    }

    cursorMs = snapToAgendaSlot(nowRomeLocalDate()).getTime();
    for (const serviceId of serviceIds) {
      const resolved = resolvedServices.data.get(serviceId);
      if (!resolved) continue;
      const lineStart = toNoZ(snapToAgendaSlot(new Date(cursorMs)));
      const lineEnd = computeLineEndTime(lineStart, resolved.duration_minutes);
      await assertStaffScheduledForStartTime({
        supabase: supabaseAdmin,
        salonId,
        staffId,
        startTime: lineStart,
        durationMinutes: resolved.duration_minutes,
        scheduleMap,
        operationalSnapshot,
        operationalIsoDate: opIsoDate ?? undefined,
      });
      await assertStaffSlotFree({
        supabase: supabaseAdmin,
        salonId,
        staffId,
        startTime: lineStart,
        endTime: lineEnd,
      });
      cursorMs += resolved.duration_minutes * 60_000;
    }

    const { data: appData, error: appErr } = await supabaseAdmin
      .from("appointments")
      .insert({
        salon_id: salonId,
        customer_id: customerId,
        staff_id: staffId,
        start_time: snappedStart,
        end_time: snappedStart,
        status: "in_sala",
        source: "walk_in",
        checked_in_at: checkedInAt,
        created_by: authData.user.id,
        notes,
        sale_id: null,
      })
      .select("id")
      .single();
    if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });

    const appointmentId = toInt((appData as { id?: unknown })?.id);
    if (!appointmentId) {
      return NextResponse.json({ error: "Creazione walk-in fallita" }, { status: 500 });
    }
    appointmentIdCreated = appointmentId;

    cursorMs = snapToAgendaSlot(nowRomeLocalDate()).getTime();
    for (const serviceId of serviceIds) {
      const resolved = resolvedServices.data.get(serviceId);
      if (!resolved) {
        return NextResponse.json({ error: `Servizio non valido (id ${serviceId}).` }, { status: 400 });
      }

      const lineRow = {
        appointment_id: appointmentId,
        service_id: serviceId,
        staff_id: staffId,
        start_time: toNoZ(snapToAgendaSlot(new Date(cursorMs))),
        duration_minutes: resolved.duration_minutes,
        price: resolved.price,
        vat_rate: resolved.vat_rate,
      };

      const { error: lineErr } = await supabaseAdmin.from("appointment_services").insert(lineRow);
      if (lineErr) {
        if (isStaffSlotConflictFromDbError(lineErr)) {
          return NextResponse.json({ error: STAFF_SLOT_CONFLICT_MESSAGE }, { status: 409 });
        }
        throw new Error(lineErr.message);
      }

      cursorMs += resolved.duration_minutes * 60_000;
    }

    const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
    if (!synced.ok) throw synced.error;

    return NextResponse.json({ ok: true, appointment_id: appointmentId });
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
    if (appointmentIdCreated != null) {
      try {
        await supabaseAdmin
          .from("appointment_services")
          .delete()
          .eq("appointment_id", appointmentIdCreated);
      } catch {}
      try {
        await supabaseAdmin.from("appointments").delete().eq("id", appointmentIdCreated);
      } catch {}
    }
    return NextResponse.json(
      { error: "Errore creazione walk-in", details: errMsg(e) },
      { status: 500 },
    );
  }
}
