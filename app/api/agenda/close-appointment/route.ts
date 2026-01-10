// app/api/agenda/close-appointment/route.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const appointment_id = Number(body?.appointment_id);

    if (!Number.isFinite(appointment_id) || appointment_id <= 0) {
      return Response.json({ error: "appointment_id missing/invalid" }, { status: 400 });
    }

    // 1) appointment
    const { data: appointment, error: appErr } = await supabaseAdmin
      .from("appointments")
      .select("id, salon_id, customer_id, staff_id, sale_id, status")
      .eq("id", appointment_id)
      .single();

    if (appErr || !appointment) {
      return Response.json({ error: "Appointment not found" }, { status: 404 });
    }

    // idempotenza: se già chiuso e collegato a sale, ritorna ok
    if (appointment.status === "done" && appointment.sale_id) {
      return Response.json(
        { success: true, sale_id: appointment.sale_id, already_closed: true },
        { status: 200 }
      );
    }

    // 2) righe servizi (prezzi NETTI)
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("appointment_services")
      .select("service_id, staff_id, price, vat_rate")
      .eq("appointment_id", appointment_id);

    if (rowsErr) {
      return Response.json(
        { error: "Error reading appointment_services", details: rowsErr.message },
        { status: 500 }
      );
    }

    if (!rows || rows.length === 0) {
      return Response.json(
        { error: "No appointment_services for appointment" },
        { status: 400 }
      );
    }

    // 3) totali: sales.total_amount = LORDO
    // vat_rate nel DB è percentuale (22 => 22%), quindi /100
    let totalGross = 0;

    const saleItems = rows.map((r: any) => {
      const net = Number(r.price ?? 0);
      const vatRate = Number(r.vat_rate ?? 22); // percentuale
      const gross = net * (1 + vatRate / 100);

      totalGross += gross;

      return {
        service_id: Number(r.service_id),
        staff_id: r.staff_id ?? appointment.staff_id ?? null,
        quantity: 1,
        price: gross, // prezzo LORDO per linea (coerente con sale_items_report)
        discount: 0,
      };
    });

    // arrotondo a 2 decimali (numeric)
    totalGross = Math.round(totalGross * 100) / 100;

    // 4) sale
    const now = new Date();
    const dateNoZ = now.toISOString().replace("Z", ""); // timestamp without time zone

    const { data: sale, error: saleErr } = await supabaseAdmin
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
      return Response.json(
        { error: "Sale creation failed", details: saleErr?.message ?? "unknown" },
        { status: 500 }
      );
    }

    // 5) sale_items
    const { error: itemsErr } = await supabaseAdmin
      .from("sale_items")
      .insert(saleItems.map((it: any) => ({ ...it, sale_id: sale.id })));

    if (itemsErr) {
      return Response.json(
        { error: "Sale items insert failed", details: itemsErr.message },
        { status: 500 }
      );
    }

    // 6) chiudo appointment (status coerente con DB/views: 'done')
    const { error: closeErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: "done", sale_id: sale.id })
      .eq("id", appointment_id);

    if (closeErr) {
      return Response.json(
        { error: "Appointment close failed", details: closeErr.message },
        { status: 500 }
      );
    }

    return Response.json({ success: true, sale_id: sale.id }, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: e?.message ?? "Errore close-appointment" },
      { status: 500 }
    );
  }
}
