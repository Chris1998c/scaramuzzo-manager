import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json();

    const { salon, items } = body;

    if (!salon || !items) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    for (const item of items) {
      await supabase.rpc("stock_decrease", {
        p_salon: salon,
        p_product: item.id,
        p_qty: item.qty,
      });

      await supabase.from("stock_movements").insert({
        salon_id: salon,
        product_id: item.id,
        qty: item.qty,
        type: "scarico",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
