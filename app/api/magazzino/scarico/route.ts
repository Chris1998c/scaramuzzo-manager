import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAGAZZINO_CENTRALE_ID = 5;

// Saloni validi: 1..4 + centrale 5
function isValidSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id <= MAGAZZINO_CENTRALE_ID;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const salonId = Number(body?.salonId);
    const productId = Number(body?.productId);
    const qty = Number(body?.qty);
    const reason =
      body?.reason && String(body.reason).trim()
        ? String(body.reason).trim()
        : "scarico_app";

    // VALIDAZIONI
    if (!isValidSalonId(salonId)) {
      return NextResponse.json({ error: "salonId non valido" }, { status: 400 });
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

    const allowed = role === "coordinator" || role === "magazzino" || role === "reception";
    if (!allowed) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // RECEPTION: può scaricare SOLO dal proprio salone
    if (role === "reception") {
      // preferisco il salon_id da user_metadata (più veloce e coerente col tuo setup)
      const mySalonId = Number(meta?.salon_id);

      if (!Number.isFinite(mySalonId) || mySalonId < 1) {
        return NextResponse.json(
          { error: "salon_id mancante sull'utente reception" },
          { status: 403 }
        );
      }

      if (mySalonId !== salonId) {
        return NextResponse.json(
          { error: "Non puoi scaricare su un altro salone" },
          { status: 403 }
        );
      }
    }

    // RPC UNICA DEFINITIVA:
    // scarico = movimento in uscita dal salone (from = salonId, to = null)
    const { error } = await supabaseAdmin.rpc("stock_move", {
      p_product: productId,
      p_qty: qty,
      p_from_salon: salonId,
      p_to_salon: null,
      p_reason: reason,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore scarico" },
      { status: 500 }
    );
  }
}
