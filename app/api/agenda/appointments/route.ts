import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  normalizeStaffId,
  parseLocal,
  snapToAgendaSlot,
  syncAppointmentHeaderFromDb,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import {
  assertStaffBelongsToSalon,
  resolveAgendaServiceLines,
} from "@/lib/agenda/appointmentServerValidation";
import {
  assertStaffScheduledForStartTime,
  isStaffScheduleConflictError,
} from "@/lib/agenda/assertStaffSchedule";
import {
  assertStaffSlotFree,
  computeLineEndTime,
  isStaffSlotConflictError,
} from "@/lib/agenda/assertStaffSlotFree";
import { fetchStaffScheduleForSalon } from "@/lib/staffSchedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceInput = {
  service_id: number;
  staff_id?: number | null;
  duration_minutes: number;
  price: number;
  vat_rate: number;
};

type CreateAppointmentBody = {
  salon_id: number;
  customer_id: string | number;
  start_time: string;
  notes?: string | null;
  services: ServiceInput[];
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

    const body = (await req.json().catch(() => null)) as CreateAppointmentBody | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const salonId = toInt(body.salon_id);
    const customerIdRaw = body.customer_id;
    const customerId = String(customerIdRaw ?? "").trim();
    const services = Array.isArray(body.services) ? body.services : [];
    const notes = body.notes == null || String(body.notes).trim() === "" ? null : String(body.notes).trim();

    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "salon_id non valido" }, { status: 400 });
    }
    if (!customerId) {
      return NextResponse.json({ error: "customer_id non valido" }, { status: 400 });
    }
    if (!services.length) {
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

    const { data: customerRow, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .maybeSingle();
    if (customerErr) return NextResponse.json({ error: customerErr.message }, { status: 500 });
    if (!customerRow) return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });

    const serviceIds = services.map((s) => toInt(s.service_id)).filter((id): id is number => !!id && id > 0);
    if (serviceIds.length !== services.length) {
      return NextResponse.json({ error: "service_id non valido" }, { status: 400 });
    }

    const resolvedServices = await resolveAgendaServiceLines(supabaseAdmin, salonId, serviceIds);
    if (!resolvedServices.ok) {
      return NextResponse.json({ error: resolvedServices.error }, { status: resolvedServices.status });
    }

    const normalizedLines: Array<{
      service_id: number;
      staff_id: number | null;
      duration_minutes: number;
      price: number;
      vat_rate: number;
    }> = [];

    for (const s of services) {
      const serviceId = toInt(s.service_id)!;
      const resolved = resolvedServices.data.get(serviceId);
      if (!resolved) {
        return NextResponse.json({ error: `Servizio non valido (id ${serviceId}).` }, { status: 400 });
      }

      const staffId = normalizeStaffId(s.staff_id);
      const staffGate = await assertStaffBelongsToSalon(supabaseAdmin, staffId, salonId);
      if (!staffGate.ok) {
        return NextResponse.json({ error: staffGate.error }, { status: staffGate.status });
      }

      normalizedLines.push({
        service_id: serviceId,
        staff_id: staffId,
        duration_minutes: resolved.duration_minutes,
        price: resolved.price,
        vat_rate: resolved.vat_rate,
      });
    }

    const snappedStart = toNoZ(snapToAgendaSlot(parseLocal(String(body.start_time))));
    const firstServiceStaff = normalizedLines[0]?.staff_id ?? null;

    const scheduleMap = await fetchStaffScheduleForSalon(supabaseAdmin, salonId);

    let cursorMs = parseLocal(snappedStart).getTime();
    for (const line of normalizedLines) {
      if (line.staff_id != null) {
        const lineStart = toNoZ(snapToAgendaSlot(new Date(cursorMs)));
        const lineEnd = computeLineEndTime(lineStart, line.duration_minutes);
        await assertStaffScheduledForStartTime({
          supabase: supabaseAdmin,
          salonId,
          staffId: line.staff_id,
          startTime: lineStart,
          durationMinutes: line.duration_minutes,
          scheduleMap,
        });
        await assertStaffSlotFree({
          supabase: supabaseAdmin,
          salonId,
          staffId: line.staff_id,
          startTime: lineStart,
          endTime: lineEnd,
        });
      }
      cursorMs += line.duration_minutes * 60_000;
    }

    const { data: appData, error: appErr } = await supabaseAdmin
      .from("appointments")
      .insert({
        salon_id: salonId,
        customer_id: customerId,
        staff_id: firstServiceStaff,
        start_time: snappedStart,
        end_time: snappedStart,
        status: "scheduled",
        notes,
      })
      .select("id")
      .single();
    if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });

    const appointmentId = toInt((appData as { id?: unknown })?.id);
    if (!appointmentId) {
      return NextResponse.json({ error: "Creazione appuntamento fallita" }, { status: 500 });
    }
    appointmentIdCreated = appointmentId;

    cursorMs = parseLocal(snappedStart).getTime();
    for (const line of normalizedLines) {
      const row = {
        appointment_id: appointmentId,
        service_id: line.service_id,
        staff_id: line.staff_id,
        start_time: toNoZ(snapToAgendaSlot(new Date(cursorMs))),
        duration_minutes: line.duration_minutes,
        price: line.price,
        vat_rate: line.vat_rate,
      };

      const { error: lineErr } = await supabaseAdmin.from("appointment_services").insert(row);
      if (lineErr) throw new Error(lineErr.message);

      cursorMs += line.duration_minutes * 60_000;
    }

    const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
    if (!synced.ok) throw synced.error;

    return NextResponse.json({ ok: true, appointment_id: appointmentId });
  } catch (e) {
    if (isStaffScheduleConflictError(e) || isStaffSlotConflictError(e)) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 409 },
      );
    }
    if (appointmentIdCreated != null) {
      try {
        await supabaseAdmin.from("appointment_services").delete().eq("appointment_id", appointmentIdCreated);
      } catch {}
      try {
        await supabaseAdmin.from("appointments").delete().eq("id", appointmentIdCreated);
      } catch {}
    }
    return NextResponse.json(
      { error: "Errore creazione appuntamento", details: errMsg(e) },
      { status: 500 }
    );
  }
}
