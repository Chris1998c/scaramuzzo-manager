// app/api/magazzino/trasferimenti/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

type TransferItem = { id: number | string; qty: number | string };

// Saloni validi: 1..4 + centrale 5
function isValidSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id <= MAGAZZINO_CENTRALE_ID;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const fromSalon = Number(body?.fromSalon);
    const toSalon = Number(body?.toSalon);
    const items: TransferItem[] = Array.isArray(body?.items) ? body.items : [];
    const details = body?.details ?? null;
    const executeNow = Boolean(body?.executeNow);

    // VALIDAZIONI SALONI (1..5)
    if (!isValidSalonId(fromSalon)) {
      return NextResponse.json({ error: "fromSalon non valido" }, { status: 400 });
    }
    if (!isValidSalonId(toSalon)) {
      return NextResponse.json({ error: "toSalon non valido" }, { status: 400 });
    }
    if (fromSalon === toSalon) {
      return NextResponse.json(
        { error: "fromSalon e toSalon non possono essere uguali" },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "items mancanti" }, { status: 400 });
    }

    // AUTH
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const role = String(userData.user.user_metadata?.role ?? "");
    if (role !== "magazzino" && role !== "coordinator") {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // NORMALIZZA ITEMS
    const rows = items
      .map((it) => ({
        product_id: Number(it?.id),
        qty: Number(it?.qty),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.product_id) &&
          r.product_id > 0 &&
          Number.isFinite(r.qty) &&
          r.qty > 0
      );

    if (rows.length !== items.length) {
      return NextResponse.json({ error: "Items non validi" }, { status: 400 });
    }

    // DETAILS SAFE
    const date =
      details?.date && typeof details.date === "string" && details.date.trim()
        ? details.date.trim()
        : null;

    const causale =
      details?.causale && typeof details.causale === "string" && details.causale.trim()
        ? details.causale.trim()
        : null;

    const note =
      details?.note && typeof details.note === "string" && details.note.trim()
        ? details.note.trim()
        : null;

    // CREA TRANSFER (draft o ready)
    const { data: transfer, error: transferError } = await supabaseAdmin
      .from("transfers")
      .insert({
        from_salon: fromSalon,
        to_salon: toSalon,
        date,
        causale,
        note,
        status: executeNow ? "ready" : "draft",
      })
      .select("id")
      .single();

    if (transferError || !transfer) {
      return NextResponse.json(
        { error: transferError?.message ?? "Errore creazione transfer" },
        { status: 500 }
      );
    }

    // INSERISCI RIGHE
    const itemsInsert = rows.map((r) => ({
      transfer_id: transfer.id,
      product_id: r.product_id,
      qty: r.qty,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("transfer_items")
      .insert(itemsInsert);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // ESEGUI SUBITO (RPC)
    if (executeNow) {
      const { error: execError } = await supabaseAdmin.rpc("execute_transfer", {
        p_transfer_id: transfer.id,
      });

      if (execError) {
        return NextResponse.json({ error: execError.message }, { status: 500 });
      }

      const { error: updError } = await supabaseAdmin
        .from("transfers")
        .update({ status: "executed" })
        .eq("id", transfer.id);

      if (updError) {
        return NextResponse.json({ error: updError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, transfer_id: transfer.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore interno" },
      { status: 500 }
    );
  }
}
