import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "").trim();
    const barcode = body.barcode ? String(body.barcode).trim() : null;
    const cost = Number(body.cost) || 0;
    const type = body.type ? String(body.type) : null;
    const description = body.description ? String(body.description) : null;
    const initialQty = Number(body.initialQty) || 0;

    if (!name || !category) {
      return NextResponse.json(
        { error: "Nome e categoria sono obbligatori" },
        { status: 400 }
      );
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const role = (user.user_metadata as any)?.role ?? "salone";
    if (role !== "magazzino" && role !== "coordinator") {
      return NextResponse.json(
        { error: "Permessi insufficienti" },
        { status: 403 }
      );
    }

    const { data: product, error: insertError } = await supabaseAdmin
      .from("products")
      .insert({
        name,
        category,
        barcode,
        cost,
        type,
        description,
      })
      .select("id")
      .single();

    if (insertError || !product) {
      return NextResponse.json(
        { error: insertError?.message ?? "Errore inserimento prodotto" },
        { status: 500 }
      );
    }

    const MAGAZZINO_CENTRALE_ID = 5;

    if (initialQty > 0) {
      const { error: stockError } = await supabaseAdmin.rpc("stock_move", {
        p_product: product.id,
        p_qty: initialQty,
        p_to_salon: MAGAZZINO_CENTRALE_ID,
        p_reason: "initial_stock",
      });

      if (stockError) {
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
    return NextResponse.json(
      { error: e?.message ?? "Errore interno" },
      { status: 500 }
    );
  }
}
