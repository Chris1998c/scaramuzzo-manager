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

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

    const snappedStart = toNoZ(snapToAgendaSlot(parseLocal(String(body.start_time))));
    const firstServiceStaff = normalizeStaffId(services[0]?.staff_id);

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

    let cursorMs = parseLocal(snappedStart).getTime();
    for (const s of services) {
      const serviceId = toInt(s.service_id);
      if (!serviceId || serviceId <= 0) throw new Error("service_id non valido");

      const duration = clampDurationMinutes(s.duration_minutes);
      const row = {
        appointment_id: appointmentId,
        service_id: serviceId,
        staff_id: normalizeStaffId(s.staff_id),
        start_time: toNoZ(snapToAgendaSlot(new Date(cursorMs))),
        duration_minutes: duration,
        price: toNum(s.price, 0),
        vat_rate: toNum(s.vat_rate, 22),
      };

      const { error: lineErr } = await supabaseAdmin.from("appointment_services").insert(row);
      if (lineErr) throw new Error(lineErr.message);

      cursorMs += duration * 60_000;
    }

    const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
    if (!synced.ok) throw synced.error;

    return NextResponse.json({ ok: true, appointment_id: appointmentId });
  } catch (e) {
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
