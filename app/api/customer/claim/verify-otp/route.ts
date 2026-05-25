// POST /api/customer/claim/verify-otp
import { NextResponse } from "next/server";
import { getAuthenticatedUserFromRequest } from "@/lib/getAuthenticatedUserFromRequest";
import { findCustomerByCode } from "@/lib/customerClaim/claimShared";
import { completeClaimOtpVerification } from "@/lib/customerClaim/verifyClaimOtp";
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
    const otpRaw = typeof body?.otp === "string" ? body.otp.trim() : "";

    if (!customer_code || !otpRaw) {
      return NextResponse.json(
        { success: false, error: "Parametri customer_code e otp obbligatori." },
        { status: 400 }
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

    const result = await completeClaimOtpVerification({
      userId: user.id,
      customerId: customer.id as string,
      otpRaw,
      includeCustomerIdInSuccess: true,
    });

    return result.response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Richiesta non valida." },
      { status: 400 }
    );
  }
}
