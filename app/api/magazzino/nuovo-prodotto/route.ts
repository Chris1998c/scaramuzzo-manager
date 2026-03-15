// app/api/magazzino/nuovo-prodotto/route.ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

    if (!name || !category) {
      return NextResponse.json({ error: "Nome e categoria sono obbligatori" }, { status: 400 });
    }
    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "Costo non valido" }, { status: 400 });
    }
    if (!Number.isFinite(initialQty) || initialQty < 0) {
      return NextResponse.json({ error: "Quantità iniziale non valida" }, { status: 400 });
    }

    // auth
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userId = userData.user.id;
    const dbRole = await getRoleFromDb(userId);
    const role = (dbRole || roleFromMetadata(userData.user)).trim();
    if (role !== "magazzino" && role !== "coordinator") {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }

    // crea prodotto (service role)
    const { data: product, error: insertError } = await supabaseAdmin
      .from("products")
      .insert({
        name,
        category,
        barcode,
        cost,
        type,
        description,
        active: true,
        vat_rate: 22, // se hai questa colonna e vuoi default
        unit: "pz",   // se hai questa colonna e vuoi default
      })
      .select("id")
      .single();

    if (insertError || !product) {
      return NextResponse.json(
        { error: insertError?.message ?? "Errore inserimento prodotto" },
        { status: 500 }
      );
    }

    // stock iniziale nel CENTRALE via RPC (service role)
    if (initialQty > 0) {
      const { error: moveErr } = await supabaseAdmin.rpc("stock_move", {
        p_product_id: Number(product.id),
        p_qty: initialQty,
        p_from_salon: null,
        p_to_salon: MAGAZZINO_CENTRALE_ID,
        p_movement_type: "carico",
        p_reason: "initial_stock",
      });

      if (moveErr) {
        return NextResponse.json({ error: moveErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, productId: product.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore interno" }, { status: 500 });
  }
}
