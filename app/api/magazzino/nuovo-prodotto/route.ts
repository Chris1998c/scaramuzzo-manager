// app/api/magazzino/nuovo-prodotto/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isOperationalSalonId, MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
import { getUserAccess } from "@/lib/getUserAccess";
import { requireClientRequestIdResponse } from "@/lib/magazzino/idempotency";

type CreateProductRpcResult = {
  ok?: boolean;
  idempotent?: boolean;
  product_id?: number;
};

function parseCreateProductRpcResult(data: unknown): CreateProductRpcResult | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const pid = d.product_id != null ? Number(d.product_id) : undefined;
  return {
    ok: d.ok === true,
    idempotent: d.idempotent === true,
    product_id: Number.isFinite(pid) ? pid : undefined,
  };
}

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
    const rawStockSalon = body?.initialStockSalonId;

    const requestParsed = requireClientRequestIdResponse(body?.request_id);
    if (requestParsed instanceof NextResponse) return requestParsed;
    const clientRequestId = requestParsed.id;

    if (!name || !category) {
      return NextResponse.json({ error: "Nome e categoria sono obbligatori" }, { status: 400 });
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "Costo non valido" }, { status: 400 });
    }
    if (!Number.isFinite(initialQty) || initialQty < 0) {
      return NextResponse.json({ error: "Quantità iniziale non valida" }, { status: 400 });
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

    let stockTargetSalonId = MAGAZZINO_CENTRALE_ID;

    if (isReception) {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || !isOperationalSalonId(mySalonId)) {
        return NextResponse.json(
          {
            error:
              "Salone non associato o non operativo. La reception può creare prodotti solo sui saloni 1–4.",
          },
          { status: 403 }
        );
      }

      if (rawStockSalon !== undefined && rawStockSalon !== null && rawStockSalon !== "") {
        const requested = Number(rawStockSalon);
        if (Number.isFinite(requested) && requested !== mySalonId) {
          return NextResponse.json(
            { error: "Non puoi assegnare la giacenza iniziale a un altro salone." },
            { status: 403 }
          );
        }
      }

      stockTargetSalonId = mySalonId;
    } else if (rawStockSalon !== undefined && rawStockSalon !== null && rawStockSalon !== "") {
      const n = Number(rawStockSalon);
      if (!Number.isFinite(n) || n < 1 || n > MAGAZZINO_CENTRALE_ID) {
        return NextResponse.json({ error: "Salone destinazione giacenza non valido." }, { status: 400 });
      }
      if (!access.allowedSalonIds.includes(n)) {
        return NextResponse.json(
          { error: "Non hai accesso a questo salone per la giacenza iniziale." },
          { status: 403 }
        );
      }
      stockTargetSalonId = n;
    }

    const { data, error } = await supabaseAdmin.rpc("create_product_with_initial_stock", {
      p_name: name,
      p_category: category,
      p_barcode: barcode,
      p_cost: cost,
      p_type: type,
      p_description: description,
      p_initial_qty: initialQty,
      p_stock_salon_id: stockTargetSalonId,
      p_client_request_id: clientRequestId,
      p_created_by: userData.user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const parsed = parseCreateProductRpcResult(data);
    if (!parsed?.ok || parsed.product_id == null) {
      return NextResponse.json({ error: "Risposta creazione prodotto non valida" }, { status: 500 });
    }

    if (parsed.idempotent) {
      return NextResponse.json(
        { ok: true, idempotent: true, productId: parsed.product_id },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, productId: parsed.product_id }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
