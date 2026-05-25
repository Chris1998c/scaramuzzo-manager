// POST /api/customer/claim/request-otp-by-phone
import { NextResponse } from "next/server";

import { findCustomersByClaimPhone } from "@/lib/customerClaim/findCustomersByPhone";
import { parseClaimPhoneInput } from "@/lib/customerClaim/normalizeClaimPhone";
import { resolveUniqueCustomerFromClaimPhoneLookup } from "@/lib/customerClaim/resolveClaimPhoneLookup";
import { requestClaimOtpForCustomer } from "@/lib/customerClaim/requestClaimOtp";
import { canRequestOtp } from "@/lib/customerClaim/rateLimit";
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

    if (!phoneRaw) {
      return NextResponse.json(
        { success: false, error: "Parametro phone obbligatorio." },
        { status: 400 },
      );
    }

    if (!parseClaimPhoneInput(phoneRaw).ok) {
      return NextResponse.json(
        { success: false, error: "Numero di telefono non valido." },
        { status: 400 },
      );
    }

    const rl = canRequestOtp(user.id);
    if (!rl.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Troppe richieste. Riprova più tardi.",
          code: "rate_limited",
          retry_after_sec: rl.retryAfterSec,
        },
        { status: 429 },
      );
    }

    const lookup = await findCustomersByClaimPhone(phoneRaw);
    const resolved = resolveUniqueCustomerFromClaimPhoneLookup(lookup);
    if (!resolved.ok) {
      return resolved.response;
    }

    const customer = resolved.customer;
    const result = await requestClaimOtpForCustomer({
      userId: user.id,
      customerId: customer.id,
      phone: customer.phone,
    });

    return result.response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Richiesta non valida." },
      { status: 400 },
    );
  }
}
