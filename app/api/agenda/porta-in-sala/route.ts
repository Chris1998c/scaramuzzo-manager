// app/api/agenda/porta-in-sala/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown) {
  if (!e) return "unknown";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as any).message);
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

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // BODY
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

    // LOAD appointment (admin)
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, status")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });
    if (!appt) return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });

    const apptSalonId = toInt((appt as any).salon_id);
    if (!apptSalonId || apptSalonId <= 0) {
      return NextResponse.json({ error: "salon_id appuntamento non valido" }, { status: 400 });
    }

    // AUTHZ: reception solo sul proprio salone; altri su saloni consentiti
    if (role === "reception") {
      const mySalonId = access.staffSalonId;
      if (!mySalonId) {
        return NextResponse.json({ error: "Reception senza staff.salon_id associato" }, { status: 403 });
      }
      if (apptSalonId !== mySalonId) {
        return NextResponse.json({ error: "salon_id non consentito per questo utente" }, { status: 403 });
      }
    } else if (!access.allowedSalonIds.includes(apptSalonId)) {
      return NextResponse.json({ error: "salon_id non consentito per questo utente" }, { status: 403 });
    }

    const currentStatus = String((appt as any).status || "").trim();

    // DONE: non tocchiamo
    if (currentStatus === "done") {
      return NextResponse.json(
        { error: "Appuntamento già chiuso (done): transizione verso in_sala non consentita" },
        { status: 409 }
      );
    }

    if (currentStatus === "cancelled") {
      return NextResponse.json(
        { error: "Appuntamento cancellato: transizione verso in_sala non consentita" },
        { status: 409 }
      );
    }

    // già in_sala: idempotente
    if (currentStatus === "in_sala") {
      return NextResponse.json(
        { ok: true, appointment_id: appointmentId, status: "in_sala", changed: false, already_in_sala: true },
        { status: 200 }
      );
    }

    // UPDATE -> in_sala (safe vs race: aggiorna solo se non è già done/in_sala)
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: "in_sala" })
      .eq("id", appointmentId)
      .neq("status", "done")
      .neq("status", "cancelled")
      .neq("status", "in_sala")
      .select("id, salon_id, status")
      .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // se qualcun altro ha cambiato status nel frattempo, rispondiamo pulito
    if (!updated) {
      const { data: appt2, error: appt2Err } = await supabaseAdmin
        .from("appointments")
        .select("id, status")
        .eq("id", appointmentId)
        .maybeSingle();

      if (appt2Err) return NextResponse.json({ error: appt2Err.message }, { status: 500 });

      const s2 = String((appt2 as any)?.status || "").trim();
      if (s2 === "done") {
        return NextResponse.json(
          { error: "Appuntamento già chiuso (done): transizione verso in_sala non consentita" },
          { status: 409 }
        );
      }
      if (s2 === "cancelled") {
        return NextResponse.json(
          { error: "Appuntamento cancellato: transizione verso in_sala non consentita" },
          { status: 409 }
        );
      }
      if (s2 === "in_sala") {
        return NextResponse.json(
          { ok: true, appointment_id: appointmentId, status: "in_sala", changed: false, already_in_sala: true },
          { status: 200 }
        );
      }

      // fallback ultra-robusto
      return NextResponse.json(
        { ok: true, appointment_id: appointmentId, status: s2 || "unknown", changed: false },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, appointment: updated, changed: true });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
