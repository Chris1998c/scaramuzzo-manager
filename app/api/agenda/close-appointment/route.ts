// app/api/agenda/close-appointment/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();

    // AUTH: deve essere loggato
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const appointment_id = Number(body?.appointment_id);

    if (!Number.isFinite(appointment_id) || appointment_id <= 0) {
      return NextResponse.json(
        { error: "appointment_id missing/invalid" },
        { status: 400 }
      );
    }

    // 1) appointment (RLS qui: reception vedrà solo il suo salone)
    const { data: appointment, error: appErr } = await supabase
      .from("appointments")
      .select("id, salon_id, customer_id, staff_id, sale_id, status")
      .eq("id", appointment_id)
      .single();

    if (appErr || !appointment) {
      // se reception prova a chiuderne uno di un altro salone -> con RLS sembrerà "not found"
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // idempotenza
    if (appointment.status === "done" && appointment.sale_id) {
      return NextResponse.json(
        { success: true, sale_id: appointment.sale_id, already_closed: true },
        { status: 200 }
      );
    }

    // 2) righe servizi (prezzi NETTI) - anche qui RLS su appointment_services
    const { data: rows, error: rowsErr } = await supabase
      .from("appointment_services")
      .select("service_id, staff_id, price, vat_rate")
      .eq("appointment_id", appointment_id);

    if (rowsErr) {
      return NextResponse.json(
        { error: "Error reading appointment_services", details: rowsErr.message },
        { status: 500 }
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No appointment_services for appointment" },
        { status: 400 }
      );
    }

    // 3) totali LORDI
    let totalGross = 0;

    const saleItems = rows.map((r: any) => {
      const net = Number(r.price ?? 0);
      const vatRate = Number(r.vat_rate ?? 22);
      const gross = net * (1 + vatRate / 100);

      totalGross += gross;

      return {
        service_id: Number(r.service_id),
        staff_id: r.staff_id ?? appointment.staff_id ?? null,
        quantity: 1,
        price: Math.round(gross * 100) / 100,
        discount: 0,
      };
    });

    totalGross = Math.round(totalGross * 100) / 100;

    // 4) crea sale (RLS: reception inserisce solo nel proprio salone)
    const now = new Date();
    const dateNoZ = now.toISOString().replace("Z", "");

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .insert({
        salon_id: appointment.salon_id,
        customer_id: appointment.customer_id,
        total_amount: totalGross,
        payment_method: "cash",
        discount: 0,
        date: dateNoZ,
      })
      .select("id")
      .single();

    if (saleErr || !sale) {
      return NextResponse.json(
        { error: "Sale creation failed", details: saleErr?.message ?? "unknown" },
        { status: 500 }
      );
    }

    // 5) sale_items
    const { error: itemsErr } = await supabase
      .from("sale_items")
      .insert(saleItems.map((it: any) => ({ ...it, sale_id: sale.id })));

    if (itemsErr) {
      return NextResponse.json(
        { error: "Sale items insert failed", details: itemsErr.message },
        { status: 500 }
      );
    }

    // 6) chiudo appointment
    const { error: closeErr } = await supabase
      .from("appointments")
      .update({ status: "done", sale_id: sale.id })
      .eq("id", appointment_id);

    if (closeErr) {
      return NextResponse.json(
        { error: "Appointment close failed", details: closeErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, sale_id: sale.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore close-appointment" },
      { status: 500 }
    );
  }
}
