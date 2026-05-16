// app/api/magazzino/trasferimenti/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MAGAZZINO_CENTRALE_ID, isOperationalSalonId } from "@/lib/constants";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  idempotentTransferResponse,
  isUniqueViolation,
  requireClientRequestIdResponse,
  resolveTransferIdempotent,
} from "@/lib/magazzino/idempotency";

type TransferItem = { id: number | string; qty: number | string };

function isValidSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id <= MAGAZZINO_CENTRALE_ID;
}

function transferRequestMarker(requestId: string): string {
  return `[[rid:${requestId}]]`;
}

function appendTransferMarker(note: string | null, requestId: string): string | null {
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
    const requestParsed = requireClientRequestIdResponse(body?.request_id);
    if (requestParsed instanceof NextResponse) return requestParsed;
    const clientRequestId = requestParsed.id;

    if (items.length === 0) {
      return NextResponse.json({ error: "items mancanti" }, { status: 400 });
    }

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

    if (isReception) {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || !isOperationalSalonId(mySalonId)) {
        return NextResponse.json(
          {
            error:
              "Salone non associato o non operativo. La reception opera solo sui saloni 1–4.",
          },
          { status: 403 }
        );
      }
      fromSalon = mySalonId;
    }

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
    if (isReception) {
      if (!isOperationalSalonId(toSalon)) {
        return NextResponse.json(
          {
            error:
              "La reception può trasferire solo tra saloni operativi (1–4), non verso o dal Magazzino Centrale.",
          },
          { status: 403 }
        );
      }
    }
    if (isWarehouse) {
      if (!access.allowedSalonIds.includes(fromSalon) || !access.allowedSalonIds.includes(toSalon)) {
        return NextResponse.json(
          { error: "fromSalon/toSalon non consentiti per questo utente" },
          { status: 403 }
        );
      }
    }

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
    const noteWithMarker = appendTransferMarker(note, clientRequestId);

    const existing = await resolveTransferIdempotent({
      clientRequestId,
      executeNow,
      actorId: userId,
    });
    if (existing) {
      return idempotentTransferResponse(existing.transfer_id);
    }

    const { data: transfer, error: transferError } = await supabaseAdmin
      .from("transfers")
      .insert({
        from_salon: fromSalon,
        to_salon: toSalon,
        date,
        causale,
        note: noteWithMarker,
        status: executeNow ? "ready" : "draft",
        client_request_id: clientRequestId,
      })
      .select("id")
      .single();

    if (transferError) {
      if (isUniqueViolation(transferError)) {
        const replay = await resolveTransferIdempotent({
          clientRequestId,
          executeNow,
          actorId: userId,
        });
        if (replay) {
          return idempotentTransferResponse(replay.transfer_id);
        }
      }
      return NextResponse.json(
        { error: transferError.message ?? "Errore creazione transfer" },
        { status: 500 }
      );
    }

    if (!transfer) {
      return NextResponse.json({ error: "Errore creazione transfer" }, { status: 500 });
    }

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

    if (executeNow) {
      const { error: execError } = await supabaseAdmin.rpc("execute_transfer", {
        p_transfer_id: transfer.id,
        p_actor_id: userId,
      });

      if (execError) {
        console.error("execute_transfer failed", {
          transferId: transfer.id,
          error: execError.message,
        });

        await supabaseAdmin
          .from("transfer_items")
          .delete()
          .eq("transfer_id", transfer.id);

        await supabaseAdmin.from("transfers").delete().eq("id", transfer.id);

        return NextResponse.json({ error: execError.message }, { status: 500 });
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
