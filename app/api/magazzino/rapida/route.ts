// app/api/magazzino/rapida/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

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

function requestMarker(requestId: string): string {
  return `[rid:${requestId}]`;
}

function appendReasonMarker(reason: string, requestId: string | null): string {
  if (!requestId) return reason;
  const marker = requestMarker(requestId);
  return reason.includes(marker) ? reason : `${reason} ${marker}`.trim();
}

async function findDuplicateMovement(args: {
  requestId: string;
  productId: number;
  fromSalon: number | null;
  toSalon: number | null;
}): Promise<{ id: number } | null> {
  const cutoffIso = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const marker = requestMarker(args.requestId);
  let q = supabaseAdmin
    .from("stock_movements")
    .select("id")
    .eq("product_id", args.productId)
    .gte("created_at", cutoffIso)
    .ilike("reason", `%${marker}%`)
    .order("id", { ascending: false })
    .limit(1);
  q = args.fromSalon == null ? q.is("from_salon", null) : q.eq("from_salon", args.fromSalon);
  q = args.toSalon == null ? q.is("to_salon", null) : q.eq("to_salon", args.toSalon);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return { id: Number((data as { id: number }).id) };
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const productId = Number(body?.productId);
    const qty = Math.max(1, Math.floor(Number(body?.qty)) || 1);
    const bodySalonId = Number(body?.salonId);
    const requestId = normalizeRequestId(body?.request_id);

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
      if (!mySalonId || !isValidSalonId(mySalonId)) {
        return NextResponse.json(
          { error: "Salone non associato al tuo account. Contatta l'amministratore." },
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

    if (requestId) {
      const dup = await findDuplicateMovement({
        requestId,
        productId,
        fromSalon,
        toSalon: null,
      });
      if (dup) {
        return NextResponse.json({ ok: true, idempotent: true, duplicate_movement_id: dup.id }, { status: 200 });
      }
    }

    const { error } = await supabaseAdmin.rpc("stock_move", {
      p_product_id: productId,
      p_qty: qty,
      p_from_salon: fromSalon,
      p_to_salon: null,
      p_movement_type: "scarico",
      p_reason: appendReasonMarker("rapida", requestId),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore scarico rapida" },
      { status: 500 }
    );
  }
}
