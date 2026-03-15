// app/api/magazzino/rapida/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getReceptionSalonId } from "@/lib/receptionSalon";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

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

    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "productId non valido" }, { status: 400 });
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

    let fromSalon: number;

    if (isReception) {
      const mySalonId = await getReceptionSalonId(userId);
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
      fromSalon = bodySalonId;
    }

    const { error } = await supabaseAdmin.rpc("stock_move", {
      p_product_id: productId,
      p_qty: qty,
      p_from_salon: fromSalon,
      p_to_salon: null,
      p_movement_type: "scarico",
      p_reason: "rapida",
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
