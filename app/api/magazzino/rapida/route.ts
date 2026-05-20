// app/api/magazzino/rapida/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { MAGAZZINO_CENTRALE_ID, isOperationalSalonId } from "@/lib/constants";
import {
  idempotentMovementResponse,
  requireClientRequestIdResponse,
  runStockMoveIdempotent,
} from "@/lib/magazzino/idempotency";

function isValidSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id <= MAGAZZINO_CENTRALE_ID;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const productId = Number(body?.productId);
    const qty = Math.max(1, Math.floor(Number(body?.qty)) || 1);
    const bodySalonId = Number(body?.salonId);
    const requestParsed = requireClientRequestIdResponse(body?.request_id);
    if (requestParsed instanceof NextResponse) return requestParsed;
    const clientRequestId = requestParsed.id;

    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "productId non valido" }, { status: 400 });
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

    let fromSalon: number;

    if (isReception) {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || !isOperationalSalonId(mySalonId)) {
        return NextResponse.json(
          {
            error:
              "La reception può operare solo sui saloni operativi (1–4), non sul Magazzino Centrale.",
          },
          { status: 403 }
        );
      }
      fromSalon = mySalonId;
    } else {
      if (!isValidSalonId(bodySalonId)) {
        return NextResponse.json({ error: "salonId non valido" }, { status: 400 });
      }
      if (!access.allowedSalonIds.includes(bodySalonId)) {
        return NextResponse.json(
          { error: "salonId non consentito per questo utente" },
          { status: 403 }
        );
      }
      fromSalon = bodySalonId;
    }

    const result = await runStockMoveIdempotent({
      clientRequestId,
      actorId: userData.user.id,
      rpc: {
        p_product_id: productId,
        p_qty: qty,
        p_from_salon: fromSalon,
        p_to_salon: null,
        p_movement_type: "scarico",
        p_reason: "rapida",
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
      { error: e?.message ?? "Errore scarico rapida" },
      { status: 500 }
    );
  }
}
