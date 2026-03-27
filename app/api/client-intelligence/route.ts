import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { getClientIntelligenceData } from "@/lib/client-intelligence/getClientIntelligenceData";
import { buildClientInsights } from "@/lib/client-intelligence/buildClientInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toInt = (x: unknown, fb = NaN) => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
};

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

  const access = await getUserAccess();
  const role = access.role;

  if (!["reception", "coordinator", "magazzino"].includes(role)) {
    return NextResponse.json({ error: "Non autorizzato", insights: null }, { status: 403 });
  }

  if (role === "reception") {
    const mySalonId = access.staffSalonId;
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
    if (!access.allowedSalonIds.includes(requestedSalonId)) {
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
