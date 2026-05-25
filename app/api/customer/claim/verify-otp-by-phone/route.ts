// POST /api/customer/claim/verify-otp-by-phone
import { NextResponse } from "next/server";

import { findCustomersByClaimPhone } from "@/lib/customerClaim/findCustomersByPhone";
import { parseClaimPhoneInput } from "@/lib/customerClaim/normalizeClaimPhone";
import { resolveUniqueCustomerFromClaimPhoneLookup } from "@/lib/customerClaim/resolveClaimPhoneLookup";
import { completeClaimOtpVerification } from "@/lib/customerClaim/verifyClaimOtp";
import { getAuthenticatedUserFromRequest } from "@/lib/getAuthenticatedUserFromRequest";
import { resolveCustomerClaimOtpPepper } from "@/lib/customerClaimConfig";

export async function POST(req: Request) {
  try {
    const pepperCfg = resolveCustomerClaimOtpPepper();
    if (!pepperCfg.ok) {
      return NextResponse.json(
        {
          success: false,
          error: pepperCfg.message,
          code: pepperCfg.code,
        },
        { status: 503 },
      );
    }

    const auth = await getAuthenticatedUserFromRequest(req);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: "Autenticazione richiesta." },
        { status: 401 },
      );
    }
    const { user } = auth;

    const body = await req.json().catch(() => null);
    const phoneRaw = typeof body?.phone === "string" ? body.phone.trim() : "";
    const otpRaw = typeof body?.otp === "string" ? body.otp.trim() : "";

    if (!phoneRaw || !otpRaw) {
      return NextResponse.json(
        { success: false, error: "Parametri phone e otp obbligatori." },
        { status: 400 },
      );
    }

    if (!parseClaimPhoneInput(phoneRaw).ok) {
      return NextResponse.json(
        { success: false, error: "Numero di telefono non valido." },
        { status: 400 },
      );
    }

    const lookup = await findCustomersByClaimPhone(phoneRaw);
    const resolved = resolveUniqueCustomerFromClaimPhoneLookup(lookup);
    if (!resolved.ok) {
      return resolved.response;
    }

    const result = await completeClaimOtpVerification({
      userId: user.id,
      customerId: resolved.customer.id,
      otpRaw,
      linkMethod: "whatsapp_otp",
      includeCustomerIdInSuccess: false,
    });

    return result.response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Richiesta non valida." },
      { status: 400 },
    );
  }
}
