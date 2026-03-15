// app/api/magazzino/carico/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getReceptionSalonId } from "@/lib/receptionSalon";

const MAGAZZINO_CENTRALE_ID = 5;

function roleFromMetadata(user: unknown): string {
  const u = user as { user_metadata?: { role?: unknown }; app_metadata?: { role?: unknown } };
  return String(u?.user_metadata?.role ?? u?.app_metadata?.role ?? "").trim();
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const roleName = (data as { roles?: { name?: unknown } })?.roles?.name;
  return roleName ? String(roleName).trim() : null;
}

// Destinazione carico da centrale: solo saloni veri 1..4 (NO 5)
function isValidDestinationSalonId(id: number) {
  return Number.isFinite(id) && id >= 1 && id < MAGAZZINO_CENTRALE_ID;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const body = await req.json().catch(() => null);

    const productId = Number(body?.productId);
    const qty = Number(body?.qty);
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

    const userId = userData.user.id;
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(userData.user)).trim();

    const isReception = role === "reception";
    const isWarehouse = role === "magazzino" || role === "coordinator";

    if (!isReception && !isWarehouse) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // ——— RECEPTION: carico in ingresso solo nel proprio salone ———
    if (isReception) {
      const mySalonId = await getReceptionSalonId(userId);
      if (!mySalonId || mySalonId < 1 || mySalonId >= MAGAZZINO_CENTRALE_ID) {
        return NextResponse.json(
          { error: "Salone non associato al tuo account. Contatta l'amministratore." },
          { status: 403 }
        );
      }

      const { error } = await supabaseAdmin.rpc("stock_move", {
        p_product_id: productId,
        p_qty: qty,
        p_from_salon: null,
        p_to_salon: mySalonId,
        p_movement_type: "carico",
        p_reason: reason || "carico_ingresso_reception",
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

    const { error } = await supabaseAdmin.rpc("stock_move", {
      p_product_id: productId,
      p_qty: qty,
      p_from_salon: MAGAZZINO_CENTRALE_ID,
      p_to_salon: salonId,
      p_movement_type: "trasferimento",
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
