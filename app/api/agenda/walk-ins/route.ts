import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import { fetchActiveStaffIdsForSalon } from "@/lib/staffForSalon";
import {
  clampDurationMinutes,
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

    const allowedStaffIds = await fetchActiveStaffIdsForSalon(supabaseAdmin, salonId);
    if (!allowedStaffIds.includes(staffId)) {
      return NextResponse.json({ error: "Collaboratore non appartiene al salone" }, { status: 400 });
    }

    const { data: customerRow, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .maybeSingle();
    if (customerErr) return NextResponse.json({ error: customerErr.message }, { status: 500 });
    if (!customerRow) return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });

    const { data: serviceRows, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, duration, vat_rate, active, visible_in_agenda")
      .in("id", serviceIds);
    if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 });

    const byId = new Map(
      (serviceRows ?? []).map((r) => [Number((r as { id: unknown }).id), r as Record<string, unknown>]),
    );
    for (const sid of serviceIds) {
      const row = byId.get(sid);
      if (!row) {
        return NextResponse.json({ error: `Servizio ${sid} non trovato` }, { status: 400 });
      }
      if (!row.active) {
        return NextResponse.json({ error: `Servizio ${sid} non attivo` }, { status: 400 });
      }
      if (!row.visible_in_agenda) {
        return NextResponse.json(
          { error: `Servizio ${sid} non visibile in agenda` },
          { status: 400 },
        );
      }
    }

    const { data: priceRows, error: priceErr } = await supabaseAdmin
      .from("service_prices")
      .select("service_id, price")
      .eq("salon_id", salonId)
      .in("service_id", serviceIds);
    if (priceErr) return NextResponse.json({ error: priceErr.message }, { status: 500 });

    const priceMap = new Map<number, number>();
    for (const pr of priceRows ?? []) {
      const sid = toInt((pr as { service_id: unknown }).service_id);
      if (sid) priceMap.set(sid, toNum((pr as { price: unknown }).price, 0));
    }

    const checkedInAt = toNoZ(nowRomeLocalDate());
    const snappedStart = toNoZ(snapToAgendaSlot(nowRomeLocalDate()));

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

    let cursorMs = snapToAgendaSlot(nowRomeLocalDate()).getTime();
    for (const serviceId of serviceIds) {
      const row = byId.get(serviceId)!;
      const duration = clampDurationMinutes(toNum(row.duration, 15));
      const lineRow = {
        appointment_id: appointmentId,
        service_id: serviceId,
        staff_id: staffId,
        start_time: toNoZ(snapToAgendaSlot(new Date(cursorMs))),
        duration_minutes: duration,
        price: priceMap.get(serviceId) ?? 0,
        vat_rate: toNum(row.vat_rate, 22),
      };

      const { error: lineErr } = await supabaseAdmin.from("appointment_services").insert(lineRow);
      if (lineErr) throw new Error(lineErr.message);

      cursorMs += duration * 60_000;
    }

    const synced = await syncAppointmentHeaderFromDb(supabaseAdmin, appointmentId);
    if (!synced.ok) throw synced.error;

    return NextResponse.json({ ok: true, appointment_id: appointmentId });
  } catch (e) {
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
