// Timbratura con geofence 500m — flusso presenza ufficiale in produzione (attendance_logs + audit GPS).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  parseClockRequestBody,
  rejectMockedLocation,
  rejectPoorGpsAccuracy,
  resolveClockSalonId,
} from "@/lib/mobile/mobileAttendanceClockValidation";
import { verifyMobileBearerFromRequest } from "@/lib/mobileSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEOFENCE_MAX_METERS = 500;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(
  lat: number,
  lng: number,
  salonLat: number,
  salonLng: number,
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
    const auth = verifyMobileBearerFromRequest(req);
    if (!auth.ok) return auth.response;

    const rawBody: unknown = await req.json();
    const parsed = parseClockRequestBody(rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const mocked = rejectMockedLocation(parsed.body.isMocked);
    if (mocked.reject) {
      return NextResponse.json({ success: false, error: mocked.error }, { status: 403 });
    }

    const poorAcc = rejectPoorGpsAccuracy(parsed.body.accuracyM);
    if (poorAcc.reject) {
      return NextResponse.json({ success: false, error: poorAcc.error }, { status: 403 });
    }

    const staffId = auth.token.sid;
    const salonId = resolveClockSalonId(parsed.body.salonId, auth.token);
    if (salonId == null) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { lat, lng } = parsed.body;

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id, active, mobile_enabled")
      .eq("id", staffId)
      .maybeSingle();

    if (staffError) {
      throw staffError;
    }

    if (!staff || !staff.active) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!staff.mobile_enabled) {
      return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
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
        { status: 400 },
      );
    }

    const distance = getDistanceMeters(lat, lng, salonLat, salonLng);

    if (distance > GEOFENCE_MAX_METERS) {
      return NextResponse.json(
        {
          success: false,
          error: "Sei troppo lontano dal salone per timbrare",
        },
        { status: 403 },
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
      latitude: lat,
      longitude: lng,
      accuracy_m: parsed.body.accuracyM,
      is_mocked: false,
      device_id: parsed.body.deviceId,
      app_version: parsed.body.appVersion,
    });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      new_status: newType,
      salon_id: salonId,
    });
  } catch (error) {
    console.error("mobile attendance clock route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
