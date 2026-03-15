import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getClientIntelligenceData } from "@/lib/client-intelligence/getClientIntelligenceData";
import { buildClientInsights } from "@/lib/client-intelligence/buildClientInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRole = "reception" | "coordinator" | "magazzino";

const toInt = (x: unknown, fb = NaN) => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
};

function roleFromMetadata(user: unknown): string {
  const u = user as {
    user_metadata?: { role?: unknown };
    app_metadata?: { role?: unknown };
  };
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

async function getReceptionSalonId(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("salon_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const sid = toInt((data as { salon_id?: unknown })?.salon_id, NaN);
  return Number.isFinite(sid) && sid > 0 ? sid : null;
}

async function getAllowedSalonIds(userId: string): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("user_salons")
    .select("salon_id")
    .eq("user_id", userId);
  if (error || !Array.isArray(data)) return [];
  return (data as { salon_id?: unknown }[])
    .map((row) => toInt(row.salon_id, NaN))
    .filter((id) => Number.isFinite(id) && id > 0) as number[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId") ?? "";
  const salonIdRaw = searchParams.get("salonId") ?? "";

  const requestedSalonId = toInt(salonIdRaw, NaN);
  if (!customerId.trim() || !Number.isFinite(requestedSalonId) || requestedSalonId <= 0) {
    return NextResponse.json(
      { error: "customerId and salonId required", insights: null },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Non autenticato", insights: null }, { status: 401 });
  }

  const userId = authData.user.id;
  const dbRole = await getRoleFromDb(userId);
  const role = (dbRole || roleFromMetadata(authData.user)) as StaffRole;

  if (!["reception", "coordinator", "magazzino"].includes(role)) {
    return NextResponse.json({ error: "Non autorizzato", insights: null }, { status: 403 });
  }

  if (role === "reception") {
    const mySalonId = await getReceptionSalonId(userId);
    if (!mySalonId) {
      return NextResponse.json(
        { error: "Reception senza staff.salon_id associato", insights: null },
        { status: 403 }
      );
    }
    if (requestedSalonId !== mySalonId) {
      return NextResponse.json(
        { error: "salon_id non consentito per questo utente", insights: null },
        { status: 403 }
      );
    }
  } else {
    const allowedSalonIds = await getAllowedSalonIds(userId);
    if (!allowedSalonIds.length || !allowedSalonIds.includes(requestedSalonId)) {
      return NextResponse.json(
        { error: "salon_id non consentito per questo utente", insights: null },
        { status: 403 }
      );
    }
  }

  try {
    const data = await getClientIntelligenceData(customerId.trim(), requestedSalonId);
    const insights = buildClientInsights(data);
    return NextResponse.json({ insights });
  } catch (e) {
    console.error("client-intelligence:", e);
    return NextResponse.json(
      { error: "Failed to load insights", insights: null },
      { status: 500 }
    );
  }
}
