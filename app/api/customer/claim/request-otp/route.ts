// POST /api/customer/claim/request-otp
import { NextResponse } from "next/server";
import { getAuthenticatedUserFromRequest } from "@/lib/getAuthenticatedUserFromRequest";
import {
  findCustomerByCode,
} from "@/lib/customerClaim/claimShared";
import { requestClaimOtpForCustomer } from "@/lib/customerClaim/requestClaimOtp";
import { canRequestOtp } from "@/lib/customerClaim/rateLimit";
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
        { status: 401 }
      );
    }
    const { user } = auth;

    const body = await req.json().catch(() => null);
    const customer_code =
      typeof body?.customer_code === "string" ? body.customer_code.trim() : "";

    if (!customer_code) {
      return NextResponse.json(
        { success: false, error: "Parametro customer_code obbligatorio." },
        { status: 400 }
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
        { status: 429 }
      );
    }

    const { data: customer, error: custErr } = await findCustomerByCode(
      customer_code
    );

    if (custErr) {
      return NextResponse.json(
        { success: false, error: "Errore durante la ricerca del cliente." },
        { status: 500 }
      );
    }

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Nessun cliente trovato per questo codice." },
        { status: 404 }
      );
    }

    const result = await requestClaimOtpForCustomer({
      userId: user.id,
      customerId: customer.id as string,
      phone: customer.phone as string,
    });

    return result.response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Richiesta non valida." },
      { status: 400 }
    );
  }
}
