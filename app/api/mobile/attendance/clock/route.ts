// Timbratura con geofence 500m — flusso presenza ufficiale in produzione (attendance_logs).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyMobileToken } from "@/lib/mobileSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEOFENCE_MAX_METERS = 500;

type ClockRequestBody = {
  lat?: number;
  lng?: number;
};

type MobileAuthClockResult =
  | { ok: true; staffId: number; tokenSalonId: number }
  | { ok: false; response: NextResponse };

function bearerFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** JWT obbligatorio: identità solo dal token, nessun staff_id da body/query. */
function getMobileAuthUser(req: Request): MobileAuthClockResult {
  const token = bearerFromRequest(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const v = verifyMobileToken(token);
  if (!v.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, staffId: v.sid, tokenSalonId: v.salon_id };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(
  lat: number,
  lng: number,
  salonLat: number,
  salonLng: number
): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(salonLat - lat);
  const dLng = toRadians(salonLng - lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat)) *
      Math.cos(toRadians(salonLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export async function POST(req: Request) {
  try {
    const auth = getMobileAuthUser(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as ClockRequestBody;
    const staffId = auth.staffId;
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id, salon_id, mobile_enabled")
      .eq("id", staffId)
      .maybeSingle();

    if (staffError) {
      throw staffError;
    }

    if (!staff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!staff.mobile_enabled) {
      return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
    }

    const salonIdRaw = staff.salon_id;
    if (salonIdRaw == null || !Number.isInteger(Number(salonIdRaw)) || Number(salonIdRaw) <= 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const salonId = Number(salonIdRaw);

    if (auth.tokenSalonId !== salonId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, lat, lng")
      .eq("id", salonId)
      .maybeSingle();

    if (salonError) {
      throw salonError;
    }

    if (!salon) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const salonLat = salon?.lat != null ? Number(salon.lat) : NaN;
    const salonLng = salon?.lng != null ? Number(salon.lng) : NaN;

    if (!Number.isFinite(salonLat) || !Number.isFinite(salonLng)) {
      return NextResponse.json(
        { success: false, error: "Coordinate salone non configurate" },
        { status: 400 }
      );
    }

    const distance = getDistanceMeters(lat, lng, salonLat, salonLng);

    if (distance > GEOFENCE_MAX_METERS) {
      return NextResponse.json(
        {
          success: false,
          error: "Sei troppo lontano dal salone per timbrare",
        },
        { status: 403 }
      );
    }

    const { data: last, error: lastErr } = await supabaseAdmin
      .from("attendance_logs")
      .select("type")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      throw lastErr;
    }

    const newType: "in" | "out" = last?.type === "in" ? "out" : "in";

    const { error: insertError } = await supabaseAdmin.from("attendance_logs").insert({
      staff_id: staffId,
      salon_id: salonId,
      type: newType,
    });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      new_status: newType,
    });
  } catch (error) {
    console.error("mobile attendance clock route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
