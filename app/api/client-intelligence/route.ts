import { NextRequest, NextResponse } from "next/server";
import { getClientIntelligenceData } from "@/lib/client-intelligence/getClientIntelligenceData";
import { buildClientInsights } from "@/lib/client-intelligence/buildClientInsights";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId") ?? "";
  const salonIdRaw = searchParams.get("salonId") ?? "";

  const salonId = Number(salonIdRaw);
  if (!customerId.trim() || !Number.isFinite(salonId)) {
    return NextResponse.json(
      { error: "customerId and salonId required", insights: null },
      { status: 400 }
    );
  }

  try {
    const data = await getClientIntelligenceData(customerId.trim(), salonId);
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
