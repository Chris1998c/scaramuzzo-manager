// GET /api/marketing/history?salonId= — ultimi invii marketing manuali (sola lettura).
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 50;

function toInt(v: string | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : NaN;
}

export async function GET(req: NextRequest) {
  const salonId = toInt(req.nextUrl.searchParams.get("salonId"));
  if (!Number.isFinite(salonId)) {
    return NextResponse.json({ error: "salonId richiesto", rows: [] }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: "Non autenticato", rows: [] }, { status: 401 });
  }

  let access;
  try {
    access = await getUserAccess();
  } catch (e) {
    console.error("[marketing/history] getUserAccess", e);
    return NextResponse.json({ error: "Sessione non valida", rows: [] }, { status: 401 });
  }

  if (access.role === "cliente") {
    return NextResponse.json({ error: "Non autorizzato", rows: [] }, { status: 403 });
  }

  if (access.role === "reception") {
    const fixed = access.staffSalonId;
    if (!fixed || fixed !== salonId) {
      return NextResponse.json({ error: "salonId non consentito", rows: [] }, { status: 403 });
    }
  } else if (!access.allowedSalonIds.includes(salonId)) {
    return NextResponse.json({ error: "salonId non consentito", rows: [] }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("marketing_whatsapp_messages")
    .select(
      "id, salon_id, customer_id, message_text, status, sent_at, created_at, error_message, customers(first_name, last_name), salons(name)",
    )
    .eq("salon_id", salonId)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error("[marketing/history]", error);
    return NextResponse.json(
      { error: "Errore caricamento storico", rows: [] },
      { status: 500 },
    );
  }

  return NextResponse.json({ rows: data ?? [] });
}
