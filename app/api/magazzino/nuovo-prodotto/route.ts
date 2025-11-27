import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json();

    const {
      name,
      category,
      barcode,
      cost,
      type,
      description,
      initialQty,
    } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: "Nome e categoria sono obbligatori" },
        { status: 400 }
      );
    }

    // Controllo utente + ruolo
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error("Errore getUser", userError);
    }

    const user = userData?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    const role = user.user_metadata?.role ?? "salone";

    if (role !== "magazzino" && role !== "coordinator") {
      return NextResponse.json(
        { error: "Non hai i permessi per creare nuovi prodotti." },
        { status: 403 }
      );
    }

    // Insert prodotto
    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert({
        name,
        category,
        barcode: barcode || null,
        cost: Number(cost) || 0,
        type,
        description,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Errore insert products", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const qty = Number(initialQty) || 0;

    // Nel tuo DB: Magazzino Centrale è salon_id = 5
    const MAGAZZINO_CENTRALE_ID = 5;

    if (qty > 0) {
      const { error: stockError } = await supabase.rpc("stock_increase", {
        p_salon: MAGAZZINO_CENTRALE_ID,
        p_product: product.id,
        p_qty: qty,
      });

      if (stockError) {
        console.error("Errore stock_increase", stockError);
        return NextResponse.json(
          { error: stockError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { ok: true, productId: product.id },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("Errore API nuovo-prodotto", e);
    return NextResponse.json(
      { error: e?.message ?? "Errore interno" },
      { status: 500 }
    );
  }
}
