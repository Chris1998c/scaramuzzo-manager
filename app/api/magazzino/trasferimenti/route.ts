import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase(); // solo auth
    const body = await req.json();

    const { fromSalon, toSalon, items, details, executeNow } = body;

    if (
      fromSalon == null ||
      toSalon == null ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    // auth
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // 1) CREA TRANSFER (SERVICE ROLE)
    const { data: transfer, error: transferError } = await supabaseAdmin
      .from("transfers")
      .insert({
        from_salon: Number(fromSalon),
        to_salon: Number(toSalon),
        date: details?.date ?? null,
        causale: details?.causale ?? null,
        note: details?.note ?? null,
        status: executeNow ? "executed" : "pending",
      })
      .select("id")
      .single();

    if (transferError || !transfer) {
      return NextResponse.json(
        { error: transferError?.message ?? "Errore creazione transfer" },
        { status: 400 }
      );
    }

    // 2) INSERT RIGHE
    const rows = items.map((it: any) => ({
      transfer_id: transfer.id,
      product_id: Number(it.id),
      qty: Number(it.qty),
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("transfer_items")
      .insert(rows);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    // 3) ESECUZIONE IMMEDIATA
    if (executeNow) {
      const { error: execError } = await supabaseAdmin.rpc(
        "execute_transfer",
        {
          p_transfer_id: transfer.id,
        }
      );

      if (execError) {
        return NextResponse.json({ error: execError.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      ok: true,
      transfer_id: transfer.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore interno" },
      { status: 500 }
    );
  }
}
