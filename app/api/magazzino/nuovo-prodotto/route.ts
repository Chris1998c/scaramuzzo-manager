// app/api/magazzino/nuovo-prodotto/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAGAZZINO_CENTRALE_ID = Number(process.env.MAGAZZINO_CENTRALE_ID ?? 5);

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const name = String(body?.name ?? "").trim();
    const category = String(body?.category ?? "").trim();
    const barcode = body?.barcode ? String(body.barcode).trim() : null;
    const cost = Number(body?.cost) || 0;
    const type = body?.type ? String(body.type).trim() : "rivendita";
    const description = body?.description ? String(body.description).trim() : null;
    const initialQty = Number(body?.initialQty) || 0;

    if (!name || !category) {
      return NextResponse.json({ error: "Nome e categoria sono obbligatori" }, { status: 400 });
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "Costo non valido" }, { status: 400 });
    }
    if (!Number.isFinite(initialQty) || initialQty < 0) {
      return NextResponse.json({ error: "Quantità iniziale non valida" }, { status: 400 });
    }

    // auth
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const role = String(userData.user.user_metadata?.role ?? "");
    if (role !== "magazzino" && role !== "coordinator") {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    if (!Number.isFinite(MAGAZZINO_CENTRALE_ID) || MAGAZZINO_CENTRALE_ID <= 0) {
      return NextResponse.json({ error: "MAGAZZINO_CENTRALE_ID non valido" }, { status: 500 });
    }

    // crea prodotto (service role)
    const { data: product, error: insertError } = await supabaseAdmin
      .from("products")
      .insert({
        name,
        category,
        barcode,
        cost,
        type,
        description,
        active: true,
        vat_rate: 22, // se hai questa colonna e vuoi default
        unit: "pz",   // se hai questa colonna e vuoi default
      })
      .select("id")
      .single();

    if (insertError || !product) {
      return NextResponse.json(
        { error: insertError?.message ?? "Errore inserimento prodotto" },
        { status: 500 }
      );
    }

    // stock iniziale nel CENTRALE via RPC (service role)
    if (initialQty > 0) {
      const { error: moveErr } = await supabaseAdmin.rpc("stock_move", {
        p_product_id: Number(product.id),
        p_qty: initialQty,
        p_from_salon: null,
        p_to_salon: MAGAZZINO_CENTRALE_ID,
        p_movement_type: "carico",
        p_reason: "initial_stock",
      });

      if (moveErr) {
        return NextResponse.json({ error: moveErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, productId: product.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore interno" }, { status: 500 });
  }
}
