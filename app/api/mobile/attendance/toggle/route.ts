/**
 * @deprecated POST /api/mobile/attendance/toggle — timbratura senza GPS (`attendance_logs`).
 * Flusso ufficiale: POST /api/mobile/attendance/clock (geofence). Rimuovere quando nessun client la chiama.
 * Ogni risposta include `X-SM-API-Class` + `X-SM-Preferred-Replacement`.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function markDeprecatedToggle(res: NextResponse): NextResponse {
  res.headers.set("X-SM-API-Class", "mobile-deprecated-attendance-toggle");
  res.headers.set("X-SM-Preferred-Replacement", "POST /api/mobile/attendance/clock");
  return res;
}

export async function POST() {
  return markDeprecatedToggle(
    NextResponse.json(
      {
        error: "Gone",
        message: "Endpoint dismesso. Usa POST /api/mobile/attendance/clock",
      },
      { status: 410 }
    )
  );
}
