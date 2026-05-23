// Origine token mobile: unico endpoint che autentica con code+PIN; emette sempre Bearer (MOBILE_JWT_SECRET obbligatorio).
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMobileJwtConfigured } from "@/lib/mobile/mobileJwtSecret";
import {
  checkMobileLoginRateLimit,
  getClientIpFromRequest,
  mobileLoginRateLimitKey,
  recordMobileLoginFailure,
  resetMobileLoginRateLimit,
} from "@/lib/mobile/mobileLoginRateLimit";
import { assertStaffEligibleForMobileLogin } from "@/lib/mobile/mobileLoginGuards";
import { resolveStaffSalonIds } from "@/lib/mobile/mobileStaffSalons";
import { MOBILE_TOKEN_TTL_SEC, signMobileToken } from "@/lib/mobileSession";

type MobileLoginBody = {
  code?: string;
  pin?: string;
};

export async function POST(req: Request) {
  try {
    if (!isMobileJwtConfigured()) {
      console.error("mobile login: MOBILE_JWT_SECRET is not configured");
      return NextResponse.json(
        {
          error:
            "Autenticazione mobile non configurata sul server (MOBILE_JWT_SECRET mancante)",
        },
        { status: 503 },
      );
    }

    const body = (await req.json()) as MobileLoginBody;
    const code = String(body.code ?? "").trim();
    const pin = String(body.pin ?? "");

    if (!code || !pin) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const rateKey = mobileLoginRateLimitKey(getClientIpFromRequest(req), code);
    const rate = checkMobileLoginRateLimit(rateKey);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Troppi tentativi di accesso. Riprova più tardi." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSec) },
        },
      );
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id,name,salon_id,active,mobile_enabled,mobile_pin_hash")
      .eq("staff_code", code)
      .maybeSingle();

    if (staffError) {
      throw staffError;
    }

    if (!staff) {
      recordMobileLoginFailure(rateKey);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const eligibility = assertStaffEligibleForMobileLogin(staff);
    if (!eligibility.ok) {
      recordMobileLoginFailure(rateKey);
      return NextResponse.json({ error: eligibility.error }, { status: eligibility.status });
    }

    const isValidPin = await bcrypt.compare(pin, staff.mobile_pin_hash);
    if (!isValidPin) {
      recordMobileLoginFailure(rateKey);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    resetMobileLoginRateLimit(rateKey);

    const { error: updateError } = await supabaseAdmin
      .from("staff")
      .update({ mobile_last_login_at: new Date().toISOString() })
      .eq("id", staff.id);

    if (updateError) {
      throw updateError;
    }

    const primarySalonId = Number(staff.salon_id);
    if (!Number.isInteger(primarySalonId) || primarySalonId <= 0) {
      return NextResponse.json(
        { error: "Salone primario non configurato per il collaboratore" },
        { status: 403 },
      );
    }

    const salon_ids = await resolveStaffSalonIds(supabaseAdmin, staff.id as number, primarySalonId);

    let access_token: string;
    try {
      access_token = signMobileToken({
        sid: staff.id as number,
        salon_id: primarySalonId,
        salon_ids,
      });
    } catch (e) {
      console.error("mobile login token sign failed:", e);
      return NextResponse.json(
        { error: "Autenticazione mobile non configurata sul server" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      staff_id: staff.id,
      salon_id: primarySalonId,
      salon_ids,
      collaborator_name: String(staff.name ?? "").trim() || null,
      access_token,
      token_type: "Bearer",
      expires_in: MOBILE_TOKEN_TTL_SEC,
    });
  } catch (error) {
    console.error("mobile login route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
