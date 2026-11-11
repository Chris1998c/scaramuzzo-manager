// Timbratura GPS: geofence sul salone autorizzato più vicino (staff_salons + primario); ignora salon_id client.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  detectClockSalonFromGps,
  type SalonGeo,
} from "@/lib/mobile/mobileClockSalonDetect";
import {
  parseClockRequestBody,
  rejectMockedLocation,
  rejectPoorGpsAccuracy,
} from "@/lib/mobile/mobileAttendanceClockValidation";
import { insertMobileAttendanceClock } from "@/lib/mobile/mobileAttendanceClockInsert";
import {
  clockSalonIdsFromLiveAndToken,
  loadMobileLiveStaff,
} from "@/lib/mobile/mobileLiveStaffGate";
import { verifyMobileBearerFromRequest } from "@/lib/mobileSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const { lat, lng } = parsed.body;

    const live = await loadMobileLiveStaff(supabaseAdmin, staffId);
    if (!live.ok) {
      if (live.reason === "db_error") {
        throw new Error(live.message ?? "staff lookup failed");
      }
      if (live.reason === "mobile_disabled") {
        return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const salonIdsToLoad = clockSalonIdsFromLiveAndToken(auth.token, live.liveSalonIds);

    if (!salonIdsToLoad.length) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: salonRows, error: salonsError } = await supabaseAdmin
      .from("salons")
      .select("id, name, lat, lng")
      .in("id", salonIdsToLoad);

    if (salonsError) {
      throw salonsError;
    }

    const authorizedSalons: SalonGeo[] = (salonRows ?? [])
      .map((row) => {
        const id = Number((row as { id: unknown }).id);
        const name = String((row as { name: unknown }).name ?? "").trim() || `Salone ${id}`;
        const latVal = (row as { lat: unknown }).lat;
        const lngVal = (row as { lng: unknown }).lng;
        return {
          id,
          name,
          lat: latVal != null ? Number(latVal) : NaN,
          lng: lngVal != null ? Number(lngVal) : NaN,
        };
      })
      .filter((s) => Number.isInteger(s.id) && s.id > 0);

    const detected = detectClockSalonFromGps(lat, lng, authorizedSalons);

    if (!detected.ok) {
      if (detected.reason === "no_coordinates") {
        return NextResponse.json(
          { success: false, error: "Coordinate salone non configurate" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "Sei troppo lontano dal salone per timbrare",
          ...(detected.nearestSalonId != null
            ? { nearest_salon_id: detected.nearestSalonId }
            : {}),
        },
        { status: 403 },
      );
    }

    const salonId = detected.salonId;

    // Identità e salone da JWT/GPS DB — body.staff_id / body.salon_id non usati per l'insert.
    const written = await insertMobileAttendanceClock(supabaseAdmin, {
      staffId,
      salonId,
      lat,
      lng,
      accuracyM: parsed.body.accuracyM,
      deviceId: parsed.body.deviceId,
      appVersion: parsed.body.appVersion,
    });

    if (!written.ok) {
      if (written.code === "too_soon") {
        return NextResponse.json(
          {
            success: false,
            error: "Timbratura troppo ravvicinata, riprova tra qualche secondo",
            ...(written.retryAfterSec != null
              ? { retry_after_seconds: written.retryAfterSec }
              : {}),
          },
          { status: 429 },
        );
      }
      throw new Error(written.message);
    }

    return NextResponse.json({
      success: true,
      new_status: written.newStatus,
      salon_id: salonId,
      detected_salon_id: salonId,
      detected_salon_name: detected.salonName,
      distance_meters: Math.round(detected.distanceMeters),
    });
  } catch (error) {
    console.error("mobile attendance clock route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
