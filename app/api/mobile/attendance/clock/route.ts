import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ClockAction = "in" | "out";

type ClockRequestBody = {
  staff_id?: number;
  action?: ClockAction;
  lat?: number;
  lng?: number;
};

function isValidAction(action: unknown): action is ClockAction {
  return action === "in" || action === "out";
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClockRequestBody;
    const staffId = Number(body.staff_id);
    const action = body.action;
    const hasLat = body.lat !== undefined;
    const hasLng = body.lng !== undefined;
    const lat = hasLat ? Number(body.lat) : null;
    const lng = hasLng ? Number(body.lng) : null;

    const hasInvalidCoordinates =
      (hasLat && !Number.isFinite(lat)) || (hasLng && !Number.isFinite(lng));

    if (
      !Number.isInteger(staffId) ||
      staffId <= 0 ||
      !isValidAction(action) ||
      hasInvalidCoordinates
    ) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id,salon_id")
      .eq("id", staffId)
      .maybeSingle();

    if (staffError) {
      throw staffError;
    }

    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("lat,lng,radius_m")
      .eq("id", staff.salon_id)
      .maybeSingle();

    if (salonError) {
      throw salonError;
    }

    const shouldCheckGeofence = lat !== null && lng !== null;
    const salonLat = salon?.lat;
    const salonLng = salon?.lng;
    const salonRadiusM = salon?.radius_m;

    if (
      shouldCheckGeofence &&
      Number.isFinite(salonLat) &&
      Number.isFinite(salonLng) &&
      Number.isFinite(salonRadiusM)
    ) {
      const distanceMeters = haversineDistanceMeters(lat, lng, salonLat, salonLng);
      console.log("attendance geofence distance_m:", distanceMeters);

      if (distanceMeters > salonRadiusM) {
        return NextResponse.json({ error: "Sei fuori dal salone" }, { status: 403 });
      }
    }

    const { data: latestLog, error: latestLogError } = await supabaseAdmin
      .from("staff_attendance_logs")
      .select("event_type")
      .eq("staff_id", staff.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestLogError) {
      throw latestLogError;
    }

    const latestEventType = latestLog?.event_type ?? null;

    if (action === "in" && latestEventType === "clock_in") {
      return NextResponse.json({ error: "Sei già dentro" }, { status: 409 });
    }

    if (action === "out" && latestEventType !== "clock_in") {
      return NextResponse.json({ error: "Sei già fuori" }, { status: 409 });
    }

    const eventType = action === "in" ? "clock_in" : "clock_out";

    const { error: insertError } = await supabaseAdmin.from("staff_attendance_logs").insert({
      staff_id: staff.id,
      salon_id: staff.salon_id,
      event_type: eventType,
      lat,
      lng,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("mobile attendance clock route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
