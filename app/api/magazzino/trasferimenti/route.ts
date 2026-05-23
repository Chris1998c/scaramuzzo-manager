// app/api/magazzino/trasferimenti/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MAGAZZINO_CENTRALE_ID, isOperationalSalonId } from "@/lib/constants";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  idempotentTransferResponse,
  requireClientRequestIdResponse,
} from "@/lib/magazzino/idempotency";
import { parseCreateTransferRpcResult } from "@/lib/magazzino/transferRpc";

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
        id: Number(it?.id),
        qty: Number(it?.qty),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.id) &&
          r.id > 0 &&
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

    const { data, error } = await supabaseAdmin.rpc("create_and_execute_transfer", {
      p_from_salon: fromSalon,
      p_to_salon: toSalon,
      p_items: rows,
      p_client_request_id: clientRequestId,
      p_actor_id: userId,
      p_date: date,
      p_causale: causale,
      p_note: noteWithMarker,
      p_execute_now: executeNow,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const parsed = parseCreateTransferRpcResult(data);
    if (!parsed?.ok || parsed.transfer_id == null) {
      return NextResponse.json({ error: "Risposta transfer non valida" }, { status: 500 });
    }

    if (parsed.idempotent) {
      return idempotentTransferResponse(parsed.transfer_id);
    }

    return NextResponse.json({ ok: true, transfer_id: parsed.transfer_id }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
