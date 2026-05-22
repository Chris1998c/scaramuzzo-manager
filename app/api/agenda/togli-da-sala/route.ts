// app/api/agenda/togli-da-sala/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message);
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown";
  }
}

function toInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function hasLinkedSale(saleId: unknown): boolean {
  const n = typeof saleId === "number" ? saleId : Number(saleId);
  return Number.isFinite(n) && Math.trunc(n) > 0;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const appointmentId = toInt(body?.appointment_id ?? body?.id);
    if (!appointmentId || appointmentId <= 0) {
      return NextResponse.json({ error: "appointment_id missing/invalid" }, { status: 400 });
    }

    const access = await getUserAccess();
    const role = access.role;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, status, sale_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });
    if (!appt) return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });

    const apptSalonId = toInt((appt as { salon_id?: unknown }).salon_id);
    if (!apptSalonId || apptSalonId <= 0) {
      return NextResponse.json({ error: "salon_id appuntamento non valido" }, { status: 400 });
    }

    if (role === "reception") {
      const mySalonId = access.staffSalonId;
      if (!mySalonId) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 },
        );
      }
      if (apptSalonId !== mySalonId) {
        return NextResponse.json(
          { error: "salon_id non consentito per questo utente" },
          { status: 403 },
        );
      }
    } else if (!access.allowedSalonIds.includes(apptSalonId)) {
      return NextResponse.json(
        { error: "salon_id non consentito per questo utente" },
        { status: 403 },
      );
    }

    const currentStatus = String((appt as { status?: unknown }).status || "").trim();

    if (currentStatus === "done" || hasLinkedSale((appt as { sale_id?: unknown }).sale_id)) {
      return NextResponse.json(
        { error: "Appuntamento già chiuso/venduto: non è possibile togliere dalla sala." },
        { status: 409 },
      );
    }

    if (currentStatus !== "in_sala") {
      return NextResponse.json(
        { error: "L'appuntamento non è in sala." },
        { status: 409 },
      );
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: "scheduled" })
      .eq("id", appointmentId)
      .eq("status", "in_sala")
      .is("sale_id", null)
      .select("id, salon_id, status, sale_id")
      .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    if (!updated) {
      const { data: appt2, error: appt2Err } = await supabaseAdmin
        .from("appointments")
        .select("id, status, sale_id")
        .eq("id", appointmentId)
        .maybeSingle();

      if (appt2Err) return NextResponse.json({ error: appt2Err.message }, { status: 500 });

      const s2 = String((appt2 as { status?: unknown })?.status || "").trim();
      if (s2 === "done" || hasLinkedSale((appt2 as { sale_id?: unknown })?.sale_id)) {
        return NextResponse.json(
          { error: "Appuntamento già chiuso/venduto: non è possibile togliere dalla sala." },
          { status: 409 },
        );
      }
      if (s2 === "scheduled") {
        return NextResponse.json({
          ok: true,
          appointment_id: appointmentId,
          status: "scheduled",
          changed: false,
          already_scheduled: true,
        });
      }

      return NextResponse.json(
        { error: "Impossibile aggiornare lo stato dell'appuntamento." },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, appointment: updated, changed: true });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
