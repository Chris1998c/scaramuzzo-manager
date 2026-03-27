// app/api/magazzino/trasferimenti/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
import { getUserAccess } from "@/lib/getUserAccess";

type TransferItem = { id: number | string; qty: number | string };

// Saloni validi: 1..4 + centrale 5
function isValidSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id <= MAGAZZINO_CENTRALE_ID;
}

function normalizeRequestId(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s)
    ? s
    : null;
}

function transferRequestMarker(requestId: string): string {
  return `[[rid:${requestId}]]`;
}

function appendTransferMarker(note: string | null, requestId: string | null): string | null {
  if (!requestId) return note;
  const marker = transferRequestMarker(requestId);
  const base = String(note ?? "").trim();
  if (base.includes(marker)) return base;
  return base ? `${base} ${marker}` : marker;
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
    const requestId = normalizeRequestId(body?.request_id);

    if (items.length === 0) {
      return NextResponse.json({ error: "items mancanti" }, { status: 400 });
    }

    // AUTH
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userId = userData.user.id;
    const access = await getUserAccess();
    const role = access.role;
    const isReception = role === "reception";
    const isWarehouse = role === "magazzino" || role === "coordinator";

    if (!isReception && !isWarehouse) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // RECEPTION: from_salon = solo proprio salone (ignora body)
    if (isReception) {
      const mySalonId = access.staffSalonId;
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
    if (isWarehouse) {
      if (!access.allowedSalonIds.includes(fromSalon) || !access.allowedSalonIds.includes(toSalon)) {
        return NextResponse.json(
          { error: "fromSalon/toSalon non consentiti per questo utente" },
          { status: 403 }
        );
      }
    }
    if (isReception && executeNow) {
      return NextResponse.json(
        { error: "La reception non puo' eseguire subito un trasferimento" },
        { status: 403 }
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
    const noteWithMarker = appendTransferMarker(note, requestId);

    // Dedupe minimo provvisorio:
    // usa request_id nel campo note per riconoscere retry ravvicinati senza nuova tabella.
    if (requestId) {
      const marker = transferRequestMarker(requestId);
      const { data: existingTransfer } = await supabaseAdmin
        .from("transfers")
        .select("id")
        .eq("from_salon", fromSalon)
        .eq("to_salon", toSalon)
        .ilike("note", `%${marker}%`)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingTransfer) {
        return NextResponse.json(
          { ok: true, idempotent: true, transfer_id: (existingTransfer as { id: number }).id },
          { status: 200 }
        );
      }
    }

    // CREA TRANSFER (draft o ready)
    const { data: transfer, error: transferError } = await supabaseAdmin
      .from("transfers")
      .insert({
        from_salon: fromSalon,
        to_salon: toSalon,
        date,
        causale,
        note: noteWithMarker,
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
      await supabaseAdmin.from("transfers").delete().eq("id", transfer.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // ESEGUI SUBITO (RPC)
    if (executeNow) {
      const { error: execError } = await supabaseAdmin.rpc("execute_transfer", {
        p_transfer_id: transfer.id,
      });

      if (execError) {
        console.error("execute_transfer failed", { transferId: transfer.id, error: execError.message });
        return NextResponse.json({ error: execError.message }, { status: 500 });
      }

      const { error: updError } = await supabaseAdmin
        .from("transfers")
        .update({ status: "executed" })
        .eq("id", transfer.id);

      if (updError) {
        console.error("transfers status update failed after execute_transfer", {
          transferId: transfer.id,
          error: updError.message,
        });
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
