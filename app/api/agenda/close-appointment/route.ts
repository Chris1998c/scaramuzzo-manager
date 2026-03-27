// app/api/agenda/close-appointment/route.ts
// LEGACY / NON-PRIMARY PATH:
// Route secondaria: il flusso operativo principale di chiusura passa da /api/cassa/close.
// Mantenere questa route solo per compatibilita', senza usarla come riferimento per nuove feature.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
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

    const access = await getUserAccess();
    const role = access.role;

    if (!["reception", "coordinator", "magazzino"].includes(role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // BODY
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const appointmentId = toInt(body.appointment_id ?? body.id);
    if (!appointmentId || appointmentId <= 0) {
      return NextResponse.json({ error: "appointment_id invalid" }, { status: 400 });
    }

    console.warn("[legacy-route] /api/agenda/close-appointment invoked", {
      appointmentId,
      role,
    });

    // LOAD APPOINTMENT (ADMIN)
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, status, sale_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptErr || !appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const salonId = toInt((appt as any).salon_id);
    if (!salonId || salonId <= 0) {
      return NextResponse.json({ error: "appointment salon_id invalid" }, { status: 500 });
    }

    // AUTHZ: reception solo sul proprio salone; altri su saloni consentiti
    if (role === "reception") {
      const mySalonId = access.staffSalonId;
      if (!mySalonId) {
        return NextResponse.json(
          { error: "Reception senza staff.salon_id associato" },
          { status: 403 }
        );
      }
      if (salonId !== mySalonId) {
        return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
      }
    } else if (!access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json({ error: "salon_id non consentito" }, { status: 403 });
    }

    // Legacy safety route:
    // il flusso principale di chiusura passa da /api/cassa/close;
    // qui consentiamo solo una chiusura manuale sicura da stato in_sala -> done.
    const apptStatus = String((appt as any).status ?? "").trim();

    if (apptStatus === "cancelled") {
      return NextResponse.json(
        { error: "Appuntamento cancellato: chiusura non consentita" },
        { status: 409 }
      );
    }

    // Idempotente
    if ((appt as any).status === "done") {
      return NextResponse.json(
        {
          ok: true,
          appointment_id: appointmentId,
          already_closed: true,
          sale_id: (appt as any).sale_id ?? null,
        },
        { status: 200 }
      );
    }

    if (apptStatus !== "in_sala") {
      return NextResponse.json(
        {
          error:
            "Transizione non valida: close-appointment consente solo in_sala -> done",
        },
        { status: 409 }
      );
    }

    // CLOSE only (no sales creation)
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: "done" })
      .eq("id", appointmentId);

    if (updErr) {
      return NextResponse.json(
        { error: "Appointment close failed", details: errMsg(updErr) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      appointment_id: appointmentId,
      sale_id: (appt as any).sale_id ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Errore /api/agenda/close-appointment", details: errMsg(e) },
      { status: 500 }
    );
  }
}
