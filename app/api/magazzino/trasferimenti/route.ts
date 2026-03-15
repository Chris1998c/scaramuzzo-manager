// app/api/magazzino/trasferimenti/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
import { getReceptionSalonId } from "@/lib/receptionSalon";

type TransferItem = { id: number | string; qty: number | string };

function roleFromMetadata(user: unknown): string {
  const u = user as { user_metadata?: { role?: unknown }; app_metadata?: { role?: unknown } };
  return String(u?.user_metadata?.role ?? u?.app_metadata?.role ?? "").trim();
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const roleName = (data as { roles?: { name?: unknown } })?.roles?.name;
  return roleName ? String(roleName).trim() : null;
}

// Saloni validi: 1..4 + centrale 5
function isValidSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id <= MAGAZZINO_CENTRALE_ID;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    let fromSalon = Number(body?.fromSalon);
    let toSalon = Number(body?.toSalon);
    const items: TransferItem[] = Array.isArray(body?.items) ? body.items : [];
    const details = body?.details ?? null;
    const executeNow = Boolean(body?.executeNow);

    if (items.length === 0) {
      return NextResponse.json({ error: "items mancanti" }, { status: 400 });
    }

    // AUTH
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userId = userData.user.id;
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(userData.user)).trim();
    const isReception = role === "reception";
    const isWarehouse = role === "magazzino" || role === "coordinator";

    if (!isReception && !isWarehouse) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // RECEPTION: from_salon = solo proprio salone (ignora body)
    if (isReception) {
      const mySalonId = await getReceptionSalonId(userId);
      if (!mySalonId || !isValidSalonId(mySalonId)) {
        return NextResponse.json(
          { error: "Salone non associato al tuo account. Contatta l'amministratore." },
          { status: 403 }
        );
      }
      fromSalon = mySalonId;
    }

    // VALIDAZIONI SALONI
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
