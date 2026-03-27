// app/api/magazzino/carico/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

const MAGAZZINO_CENTRALE_ID = 5;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

// Destinazione carico da centrale: solo saloni veri 1..4 (NO 5)
function isValidDestinationSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id < MAGAZZINO_CENTRALE_ID;
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
    const qty = Number(body?.qty);
    const requestId = normalizeRequestId(body?.request_id);
    const reason =
      body?.reason && String(body.reason).trim()
        ? String(body.reason).trim()
        : "carico_app";
    const reasonWithMarker = appendReasonMarker(reason, requestId);

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

    // ——— RECEPTION: carico in ingresso solo nel proprio salone ———
    if (isReception) {
      const mySalonId = access.staffSalonId;
      if (!mySalonId || mySalonId < 1 || mySalonId >= MAGAZZINO_CENTRALE_ID) {
        return NextResponse.json(
          { error: "Salone non associato al tuo account. Contatta l'amministratore." },
          { status: 403 }
        );
      }

      if (requestId) {
        const dup = await findDuplicateMovement({
          requestId,
          productId,
          fromSalon: null,
          toSalon: mySalonId,
        });
        if (dup) {
          return NextResponse.json({ ok: true, idempotent: true, duplicate_movement_id: dup.id }, { status: 200 });
        }
      }

      const { error } = await supabaseAdmin.rpc("stock_move", {
        p_product_id: productId,
        p_qty: qty,
        p_from_salon: null,
        p_to_salon: mySalonId,
        p_movement_type: "carico",
        p_reason: reasonWithMarker || "carico_ingresso_reception",
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ——— MAGAZZINO / COORDINATOR: da centrale verso salone 1..4 ———
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

    if (requestId) {
      const dup = await findDuplicateMovement({
        requestId,
        productId,
        fromSalon: MAGAZZINO_CENTRALE_ID,
        toSalon: salonId,
      });
      if (dup) {
        return NextResponse.json({ ok: true, idempotent: true, duplicate_movement_id: dup.id }, { status: 200 });
      }
    }

    const { error } = await supabaseAdmin.rpc("stock_move", {
      p_product_id: productId,
      p_qty: qty,
      p_from_salon: MAGAZZINO_CENTRALE_ID,
      p_to_salon: salonId,
      p_movement_type: "trasferimento",
      p_reason: reasonWithMarker,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore carico" },
      { status: 500 }
    );
  }
}
