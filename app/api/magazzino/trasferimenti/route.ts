import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json();

    const { fromSalon, toSalon, items, details } = body;

    if (!fromSalon || !toSalon || !items) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    // CREA TRASF.
    const { data: transfer } = await supabase
      .from("transfers")
      .insert({
        from_salon: fromSalon,
        to_salon: toSalon,
        date: details?.date,
        causale: details?.causale,
        note: details?.note,
      })
      .select()
      .single();

    for (const item of items) {
      // salva compo items
      await supabase.from("transfer_items").insert({
        transfer_id: transfer.id,
        product_id: item.id,
        qty: item.qty,
      });

      // scarica
      await supabase.rpc("stock_decrease", {
        p_salon: fromSalon,
        p_product: item.id,
        p_qty: item.qty,
      });

      // carica
      await supabase.rpc("stock_increase", {
        p_salon: toSalon,
        p_product: item.id,
        p_qty: item.qty,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
