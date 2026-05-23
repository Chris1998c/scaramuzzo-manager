import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { getCustomerTimeline } from "@/lib/reports/getCustomerTimeline";

export async function GET(req: Request) {
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const access = await getUserAccess();
  if (!["coordinator", "reception", "magazzino"].includes(access.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId") ?? "";
  const salonId = Number(url.searchParams.get("salonId"));

  if (!customerId || !Number.isFinite(salonId) || salonId <= 0) {
    return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
  }
  if (!access.allowedSalonIds.includes(salonId)) {
    return NextResponse.json({ error: "Salone non consentito" }, { status: 403 });
  }

  const timeline = await getCustomerTimeline(customerId, salonId);
  return NextResponse.json(timeline);
}
