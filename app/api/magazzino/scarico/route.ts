import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAGAZZINO_CENTRALE_ID = 0;

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

    // VALIDAZIONI COERENTI COL DB
    if (!Number.isFinite(salonId) || salonId < MAGAZZINO_CENTRALE_ID) {
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

    const role = String(userData.user.user_metadata?.role ?? "");
    const allowed =
      role === "coordinator" ||
      role === "magazzino" ||
      role === "reception";

    if (!allowed) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // RECEPTION: può scaricare SOLO dal proprio salone
    if (role === "reception") {
      const { data: us, error: usErr } = await supabase
        .from("user_salons")
        .select("salon_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (usErr || us?.salon_id == null) {
        return NextResponse.json(
          { error: "Salone utente non trovato" },
          { status: 403 }
        );
      }

      if (Number(us.salon_id) !== salonId) {
        return NextResponse.json(
          { error: "Non puoi scaricare su un altro salone" },
          { status: 403 }
        );
      }
    }

    // RPC DEFINITIVA
    const { error } = await supabaseAdmin.rpc("stock_decrease", {
      p_salon: salonId,
      p_product: productId,
      p_qty: qty,
      p_reason: reason,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Errore scarico" },
      { status: 500 }
    );
  }
}
