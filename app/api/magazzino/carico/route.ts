// app/api/magazzino/carico/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  idempotentMovementResponse,
  requireClientRequestIdResponse,
  runStockMoveIdempotent,
} from "@/lib/magazzino/idempotency";

const MAGAZZINO_CENTRALE_ID = 5;

function isValidDestinationSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id < MAGAZZINO_CENTRALE_ID;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const productId = Number(body?.productId);
    const qty = Number(body?.qty);
    const requestParsed = requireClientRequestIdResponse(body?.request_id);
    if (requestParsed instanceof NextResponse) return requestParsed;
    const clientRequestId = requestParsed.id;

    const reason =
      body?.reason && String(body.reason).trim()
        ? String(body.reason).trim()
        : "carico_app";

    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "productId non valido" }, { status: 400 });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "qty non valida" }, { status: 400 });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const access = await getUserAccess();
    const role = access.role;

    const isReception = role === "reception";
    const isWarehouse = role === "magazzino" || role === "coordinator";

    if (!isReception && !isWarehouse) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    if (isReception) {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || mySalonId < 1 || mySalonId >= MAGAZZINO_CENTRALE_ID) {
        return NextResponse.json(
          { error: "Salone non associato al tuo account. Contatta l'amministratore." },
          { status: 403 }
        );
      }

      const result = await runStockMoveIdempotent({
        clientRequestId,
        actorId: userData.user.id,
        rpc: {
          p_product_id: productId,
          p_qty: qty,
          p_from_salon: null,
          p_to_salon: mySalonId,
          p_movement_type: "carico",
          p_reason: reason || "carico_ingresso_reception",
        },
      });

      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      if (result.idempotent && result.duplicate_movement_id != null) {
        return idempotentMovementResponse(result.duplicate_movement_id);
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const salonId = Number(body?.salonId);
    if (!isValidDestinationSalonId(salonId)) {
      return NextResponse.json(
        { error: "salonId non valido (destinazione deve essere 1..4)" },
        { status: 400 }
      );
    }
    if (!access.allowedSalonIds.includes(salonId)) {
      return NextResponse.json(
        { error: "salonId non consentito per questo utente" },
        { status: 403 }
      );
    }

    const result = await runStockMoveIdempotent({
      clientRequestId,
      actorId: userData.user.id,
      rpc: {
        p_product_id: productId,
        p_qty: qty,
        p_from_salon: MAGAZZINO_CENTRALE_ID,
        p_to_salon: salonId,
        p_movement_type: "trasferimento",
        p_reason: reason,
      },
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    if (result.idempotent && result.duplicate_movement_id != null) {
      return idempotentMovementResponse(result.duplicate_movement_id);
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore carico" },
      { status: 500 }
    );
  }
}
