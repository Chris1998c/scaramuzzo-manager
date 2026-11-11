import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import { assertStaffBelongsToSalon } from "@/lib/agenda/appointmentServerValidation";
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
import { canModifyAppointmentHeader } from "@/lib/agenda/appointmentLifecycle";
import {
  patchAppointmentServiceLinesAtomic,
  type AppointmentHeaderAtomicPatch,
  type AppointmentServiceLineAtomicPatch,
} from "@/lib/agenda/patchAppointmentServiceLinesAtomic";
import { shiftAppointmentLineStart } from "@/lib/agenda/shiftAppointmentLineStarts";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";
import {
  clampDurationMinutes,
  computeHeaderFromLines,
  normalizeStaffId,
  parseLocal,
  snapToAgendaSlot,
  syncAppointmentHeaderFromDb,
  toNoZ,
} from "@/lib/agenda/agendaContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceLineStaffPatch = {
  line_id: number;
  staff_id: number | null;
};

type PatchBody = Partial<{
  customer_id: string | number | null;
  notes: string | null;
  start_time: string;
  end_time: string;
  staff_id: number | null;
  /** Batch per-riga: applicato atomicamente con eventuale shift orario. */
  service_line_staff: ServiceLineStaffPatch[];
}>;

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const DELETE_BLOCKED_MESSAGE =
  "Appuntamento già operativo o collegato a una vendita: non può essere eliminato. Puoi annullarlo o gestirlo dallo storico.";

const NON_DELETABLE_STATUSES = new Set(["done", "in_sala"]);

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
      .select("id, salon_id, start_time, end_time, staff_id, status, sale_id")
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

    const rawLineStaff = Array.isArray(body.service_line_staff) ? body.service_line_staff : [];
    const perLineStaff = new Map<number, number | null>();
    for (const entry of rawLineStaff) {
      const lineId = toInt((entry as ServiceLineStaffPatch)?.line_id);
      if (!lineId || lineId <= 0) {
        return NextResponse.json({ error: "service_line_staff.line_id non valido" }, { status: 400 });
      }
      perLineStaff.set(lineId, normalizeStaffId((entry as ServiceLineStaffPatch).staff_id));
    }
    const hasPerLineStaff = perLineStaff.size > 0;

    const hasPatchPayload =
      body.customer_id !== undefined ||
      body.notes !== undefined ||
      hasStartInput ||
      hasEndInput ||
      hasStaffInput ||
      hasPerLineStaff;

    if (hasPatchPayload) {
      const headerGuard = canModifyAppointmentHeader({
        status: (appt as { status?: unknown }).status,
        sale_id: (appt as { sale_id?: unknown }).sale_id,
      });
      if (!headerGuard.allowed) {
        return NextResponse.json({ error: headerGuard.error }, { status: 409 });
      }
    }

    const { data: lineRows, error: linesErr } = await supabaseAdmin
      .from("appointment_services")
      .select(
        "id, start_time, duration_minutes, duration_active, duration_processing, need_processing, staff_id",
      )
      .eq("appointment_id", appointmentId)
      .order("start_time", { ascending: true })
      .order("id", { ascending: true });
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

    if (hasPerLineStaff) {
      const knownIds = new Set(
        (lineRows ?? [])
          .map((l) => toInt((l as { id?: unknown }).id))
          .filter((id): id is number => id != null && id > 0),
      );
      for (const lineId of perLineStaff.keys()) {
        if (!knownIds.has(lineId)) {
          return NextResponse.json(
            { error: `Riga servizio ${lineId} non appartiene all'appuntamento` },
            { status: 400 },
          );
        }
      }
    }

    const staffIdsToGate = new Set<number>();
    if (staffChanged && staffNorm != null) staffIdsToGate.add(staffNorm);
    for (const sid of perLineStaff.values()) {
      if (sid != null) staffIdsToGate.add(sid);
    }
    for (const sid of staffIdsToGate) {
      const staffGate = await assertStaffBelongsToSalon(supabaseAdmin, sid, salonId);
      if (!staffGate.ok) {
        return NextResponse.json({ error: staffGate.error }, { status: staffGate.status });
      }
    }

    type ProposedLine = {
      id: number;
      start_time: string;
      duration_minutes: number;
      staff_id: number | null;
      duration_active: number | null | undefined;
      duration_processing: number | null | undefined;
      need_processing: boolean | null | undefined;
      startChanged: boolean;
      staffChanged: boolean;
    };

    const proposedLines: ProposedLine[] = [];
    for (const l of lineRows ?? []) {
      const lineId = toInt((l as { id?: unknown }).id);
      if (!lineId || lineId <= 0) continue;
      const currentStart = String((l as { start_time?: unknown }).start_time ?? "");
      const duration = Number((l as { duration_minutes?: unknown }).duration_minutes);
      if (!currentStart || !Number.isFinite(duration) || duration <= 0) continue;

      const currentStaff = normalizeStaffId((l as { staff_id?: unknown }).staff_id);
      let nextStaff = currentStaff;
      let lineStaffChanged = false;
      if (perLineStaff.has(lineId)) {
        nextStaff = perLineStaff.get(lineId) ?? null;
        lineStaffChanged = nextStaff !== currentStaff;
      } else if (staffChanged) {
        nextStaff = staffNorm;
        lineStaffChanged = nextStaff !== currentStaff;
      }

      const nextStart = timeChanged
        ? shiftAppointmentLineStart(currentStart, deltaMs)
        : currentStart;

      proposedLines.push({
        id: lineId,
        start_time: nextStart,
        duration_minutes: duration,
        staff_id: nextStaff,
        duration_active: (l as { duration_active?: unknown }).duration_active as
          | number
          | null
          | undefined,
        duration_processing: (l as { duration_processing?: unknown }).duration_processing as
          | number
          | null
          | undefined,
        need_processing: (l as { need_processing?: unknown }).need_processing as
          | boolean
          | null
          | undefined,
        startChanged: timeChanged,
        staffChanged: lineStaffChanged,
      });
    }

    const linesNeedingWrite = proposedLines.filter((l) => l.startChanged || l.staffChanged);

    if (linesNeedingWrite.length) {
      try {
        assertBatchInternalStaffSlotsFree(
          proposedLines.map((l) => ({
            staffId: l.staff_id,
            startTime: l.start_time,
            durationMinutes: l.duration_minutes,
            duration_active: l.duration_active,
            duration_processing: l.duration_processing,
            need_processing: l.need_processing,
          })),
        );
      } catch (e) {
        if (isStaffSlotConflictOrDbError(e)) {
          return NextResponse.json({ error: STAFF_SLOT_CONFLICT_MESSAGE }, { status: 409 });
        }
        throw e;
      }

      const scheduleMap = await fetchStaffScheduleForSalon(supabaseAdmin, salonId);
      const opIsoDate = isoDateFromAgendaStartTime(toNoZ(newStart));
      const staffIdsForOp = [
        ...new Set(
          proposedLines
            .map((l) => l.staff_id)
            .filter((id): id is number => id != null),
        ),
      ];
      const operationalSnapshot =
        opIsoDate != null
          ? await fetchOperationalCalendarSnapshot(
              supabaseAdmin,
              salonId,
              opIsoDate,
              staffIdsForOp,
            )
          : undefined;

      for (const l of proposedLines) {
        if (l.staff_id == null) continue;
        if (!l.startChanged && !l.staffChanged) continue;

        await assertStaffScheduledForStartTime({
          supabase: supabaseAdmin,
          salonId,
          staffId: l.staff_id,
          startTime: l.start_time,
          durationMinutes: l.duration_minutes,
          scheduleMap,
          operationalSnapshot,
          operationalIsoDate: opIsoDate ?? undefined,
        });

        const lineEnd = computeLineEndTime(l.start_time, l.duration_minutes);
        await assertStaffSlotFree({
          supabase: supabaseAdmin,
          salonId,
          staffId: l.staff_id,
          startTime: l.start_time,
          endTime: lineEnd,
          durationMinutes: l.duration_minutes,
          duration_active: l.duration_active,
          duration_processing: l.duration_processing,
          need_processing: l.need_processing,
          excludeAppointmentId: appointmentId,
          excludeLineId: l.id,
        });
      }
    }

    if (!lineRows?.length && (timeChanged || staffChanged) && staffNorm != null) {
      const endForDuration = newEndInput
        ? newEndInput
        : new Date(
            newStart.getTime() +
              Math.max(clampDurationMinutes(15) * 60_000, oldEnd.getTime() - oldStart.getTime()),
          );
      const durationMs = Math.max(
        clampDurationMinutes(15) * 60_000,
        endForDuration.getTime() - newStart.getTime(),
      );
      const durationMinutes = clampDurationMinutes(Math.round(durationMs / 60_000));
      const headerStart = toNoZ(newStart);

      const scheduleMap = await fetchStaffScheduleForSalon(supabaseAdmin, salonId);
      const opIsoDate = isoDateFromAgendaStartTime(headerStart);
      const operationalSnapshot =
        opIsoDate != null
          ? await fetchOperationalCalendarSnapshot(supabaseAdmin, salonId, opIsoDate, [
              staffNorm,
            ])
          : undefined;

      await assertStaffScheduledForStartTime({
        supabase: supabaseAdmin,
        salonId,
        staffId: staffNorm,
        startTime: headerStart,
        durationMinutes,
        scheduleMap,
        operationalSnapshot,
        operationalIsoDate: opIsoDate ?? undefined,
      });

      const lineEnd = computeLineEndTime(headerStart, durationMinutes);
      await assertStaffSlotFree({
        supabase: supabaseAdmin,
        salonId,
        staffId: staffNorm,
        startTime: headerStart,
        endTime: lineEnd,
        excludeAppointmentId: appointmentId,
      });
    }

    if (lineRows?.length) {
      if (linesNeedingWrite.length) {
        const atomicLines: AppointmentServiceLineAtomicPatch[] = linesNeedingWrite.map((l) => ({
          id: l.id,
          ...(l.startChanged ? { start_time: l.start_time } : {}),
          ...(l.staffChanged ? { staff_id: l.staff_id, staff_id_set: true } : {}),
        }));

        // Header (orari da righe + eventuale customer/notes) nella stessa TX delle righe.
        const computed = computeHeaderFromLines(
          proposedLines.map((l) => ({
            id: l.id,
            start_time: l.start_time,
            duration_minutes: l.duration_minutes,
            staff_id: l.staff_id,
          })),
        );
        const header: AppointmentHeaderAtomicPatch = {
          start_time: computed.start_time,
          end_time: computed.end_time,
          staff_id: computed.staff_id,
          staff_id_set: true,
        };
        if (metaPatch.customer_id !== undefined) {
          header.customer_id = String(metaPatch.customer_id);
        }
        if (metaPatch.notes !== undefined) {
          header.notes = metaPatch.notes as string | null;
        }

        const written = await patchAppointmentServiceLinesAtomic(supabaseAdmin, {
          appointmentId,
          lines: atomicLines,
          header,
        });
        if (!written.ok) {
          if (isStaffSlotConflictFromDbError(written.error)) {
            return NextResponse.json({ error: STAFF_SLOT_CONFLICT_MESSAGE }, { status: 409 });
          }
          return NextResponse.json({ error: written.error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
      }

      // Solo meta (customer/notes), senza cambio orario/staff righe: update header semplice.
      if (Object.keys(metaPatch).length) {
        const { error: metaErr } = await supabaseAdmin
          .from("appointments")
          .update(metaPatch)
          .eq("id", appointmentId);
        if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
      }

      const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
      if (!synced.ok) return NextResponse.json({ error: synced.error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (Object.keys(metaPatch).length) {
      const { error: metaErr } = await supabaseAdmin
        .from("appointments")
        .update(metaPatch)
        .eq("id", appointmentId);
      if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 });
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
      .select("id, status, sale_id, salon_id")
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

    const saleId = (appt as { sale_id?: unknown }).sale_id;
    if (saleId != null && saleId !== "") {
      return NextResponse.json({ error: DELETE_BLOCKED_MESSAGE }, { status: 409 });
    }

    const status = String((appt as { status?: unknown }).status ?? "").trim();
    if (NON_DELETABLE_STATUSES.has(status)) {
      return NextResponse.json({ error: DELETE_BLOCKED_MESSAGE }, { status: 409 });
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
