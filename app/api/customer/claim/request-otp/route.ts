// POST /api/customer/claim/request-otp
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  claimOtpExpiresAtIso,
  findCustomerByCode,
  getLinkBlock,
  phoneUsableForOtp,
} from "@/lib/customerClaim/claimShared";
import { generateOtpDigits, hashClaimOtp } from "@/lib/customerClaim/otpCrypto";
import { canRequestOtp, recordRequestOtp } from "@/lib/customerClaim/rateLimit";
import { sendClaimOtpWhatsApp } from "@/lib/integrations/whatsappClaimOtp";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, error: "Autenticazione richiesta." },
        { status: 401 }
      );
    }

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

    const customerId = customer.id as string;
    const phone = customer.phone as string | null;

    if (!phoneUsableForOtp(phone)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Numero di telefono non valido o assente in anagrafica. Contatta il salone.",
          code: "phone_not_eligible",
        },
        { status: 422 }
      );
    }

    const link = await getLinkBlock(customerId, user.id);
    if (!link.ok) {
      return NextResponse.json(
        { success: false, error: "Errore durante la verifica del collegamento." },
        { status: 500 }
      );
    }
    if (link.block === "customer_already_linked") {
      return NextResponse.json(
        {
          success: false,
          error: "Questo profilo cliente è già collegato a un account.",
          code: "customer_already_linked",
        },
        { status: 409 }
      );
    }
    if (link.block === "user_already_linked") {
      return NextResponse.json(
        {
          success: false,
          error: "Il tuo account è già collegato a un profilo cliente.",
          code: "user_already_linked",
        },
        { status: 409 }
      );
    }

    await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .delete()
      .eq("user_id", user.id)
      .eq("customer_id", customerId);

    const otpDigits = generateOtpDigits();
    const otp_hash = hashClaimOtp(otpDigits);
    const expires_at = claimOtpExpiresAtIso();

    const { data: row, error: insErr } = await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .insert({
        user_id: user.id,
        customer_id: customerId,
        otp_hash,
        expires_at,
        attempt_count: 0,
      })
      .select("id, expires_at")
      .maybeSingle();

    if (insErr || !row) {
      return NextResponse.json(
        { success: false, error: "Impossibile creare la verifica OTP." },
        { status: 500 }
      );
    }

    recordRequestOtp(user.id);

    const send = await sendClaimOtpWhatsApp({
      phoneRaw: String(phone),
      otpDigits,
    });

    if (!send.ok) {
      await supabaseAdmin
        .from("customer_claim_otp_challenges")
        .delete()
        .eq("id", row.id);
      return NextResponse.json(
        {
          success: false,
          error: send.error ?? "Invio OTP non riuscito.",
          code: "otp_delivery_failed",
        },
        { status: 502 }
      );
    }

    const debugOtp = process.env.CUSTOMER_CLAIM_DEBUG_OTP === "true";

    return NextResponse.json({
      success: true,
      challenge_id: row.id,
      expires_at: row.expires_at,
      delivery: send.skipped
        ? { channel: "whatsapp", status: "skipped", reason: send.reason }
        : { channel: "whatsapp", status: "queued" },
      ...(debugOtp ? { _debug_otp: otpDigits } : {}),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Richiesta non valida." },
      { status: 400 }
    );
  }
}
