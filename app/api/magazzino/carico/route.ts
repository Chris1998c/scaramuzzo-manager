import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { salonId, productId, qty } = await req.json();

    if (!salonId || !productId || qty <= 0) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc("stock_move", {
      p_product: Number(productId),
      p_qty: Number(qty),
      p_from_salon: null,
      p_to_salon: Number(salonId),
      p_reason: "carico_app",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Errore carico" }, { status: 500 });
  }
}
