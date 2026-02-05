// app/api/magazzino/carico/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAGAZZINO_CENTRALE_ID = 5;

// Destinazione carico: solo saloni veri 1..4 (NO 5)
function isValidDestinationSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id < MAGAZZINO_CENTRALE_ID;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const salonId = Number(body?.salonId);     // DESTINAZIONE
    const productId = Number(body?.productId);
    const qty = Number(body?.qty);

    const reason =
      body?.reason && String(body.reason).trim()
        ? String(body.reason).trim()
        : "carico_app";

    // VALIDAZIONI
    if (!isValidDestinationSalonId(salonId)) {
      return NextResponse.json(
        { error: "salonId non valido (destinazione deve essere 1..4)" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "productId non valido" }, { status: 400 });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "qty non valida" }, { status: 400 });
    }

    // AUTH
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const meta: any = userData.user.user_metadata ?? {};
    const role = String(meta?.role ?? "");

    // Solo magazzino/coordinator
    if (role !== "magazzino" && role !== "coordinator") {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // RPC UNICA: centrale -> salone
    const { error } = await supabaseAdmin.rpc("stock_move", {
      p_product: productId,
      p_qty: qty,
      p_from_salon: MAGAZZINO_CENTRALE_ID,
      p_to_salon: salonId,
      p_reason: reason,
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
