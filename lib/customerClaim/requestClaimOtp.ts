import "server-only";

import { NextResponse } from "next/server";

import {
  claimOtpExpiresAtIso,
  getLinkBlock,
  phoneUsableForOtp,
} from "@/lib/customerClaim/claimShared";
import { generateOtpDigits, hashClaimOtp } from "@/lib/customerClaim/otpCrypto";
import { canRequestOtp, recordRequestOtp } from "@/lib/customerClaim/rateLimit";
import { sendClaimOtpWhatsApp } from "@/lib/integrations/whatsappClaimOtp";
import { isClaimWhatsAppDeliveryRequired } from "@/lib/integrations/whatsappClaimConfig";
import { isCustomerClaimDebugOtpEnabled } from "@/lib/customerClaimConfig";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type RequestClaimOtpResult =
  | { ok: true; response: NextResponse }
  | { ok: false; response: NextResponse };

/**
 * Crea challenge OTP e invia WhatsApp (condiviso tra claim per codice e per telefono).
 */
export async function requestClaimOtpForCustomer(params: {
  userId: string;
  customerId: string;
  phone: string;
}): Promise<RequestClaimOtpResult> {
  const { userId, customerId, phone } = params;

  if (!phoneUsableForOtp(phone)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Numero di telefono non valido o assente in anagrafica. Contatta il salone.",
          code: "phone_not_eligible",
        },
        { status: 422 },
      ),
    };
  }

  const link = await getLinkBlock(customerId, userId);
  if (!link.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Errore durante la verifica del collegamento." },
        { status: 500 },
      ),
    };
  }
  if (link.block === "customer_already_linked") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Questo profilo cliente è già collegato a un account.",
          code: "customer_already_linked",
        },
        { status: 409 },
      ),
    };
  }
  if (link.block === "user_already_linked") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Il tuo account è già collegato a un profilo cliente.",
          code: "user_already_linked",
        },
        { status: 409 },
      ),
    };
  }

  await supabaseAdmin
    .from("customer_claim_otp_challenges")
    .delete()
    .eq("user_id", userId)
    .eq("customer_id", customerId);

  const otpDigits = generateOtpDigits();
  const otp_hash = hashClaimOtp(otpDigits);
  const expires_at = claimOtpExpiresAtIso();

  const { data: row, error: insErr } = await supabaseAdmin
    .from("customer_claim_otp_challenges")
    .insert({
      user_id: userId,
      customer_id: customerId,
      otp_hash,
      expires_at,
      attempt_count: 0,
    })
    .select("id, expires_at")
    .maybeSingle();

  if (insErr || !row) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Impossibile creare la verifica OTP." },
        { status: 500 },
      ),
    };
  }

  recordRequestOtp(userId);

  const send = await sendClaimOtpWhatsApp({
    phoneRaw: String(phone),
    otpDigits,
  });

  if (!send.ok) {
    await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .delete()
      .eq("id", row.id);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: send.error ?? "Invio OTP non riuscito.",
          code: send.code ?? "otp_delivery_failed",
        },
        { status: send.code?.includes("not_configured") ? 503 : 502 },
      ),
    };
  }

  if (send.skipped && isClaimWhatsAppDeliveryRequired()) {
    await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .delete()
      .eq("id", row.id);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "Invio OTP WhatsApp non disponibile: configurare WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_OTP_TEMPLATE_NAME.",
          code: send.reason ?? "whatsapp_not_configured",
        },
        { status: 503 },
      ),
    };
  }

  const debugOtp = isCustomerClaimDebugOtpEnabled();

  return {
    ok: true,
    response: NextResponse.json({
      success: true,
      challenge_id: row.id,
      expires_at: row.expires_at,
      delivery: send.skipped
        ? { channel: "whatsapp", status: "skipped", reason: send.reason }
        : {
            channel: "whatsapp",
            status: "sent",
            message_id: send.providerMessageId ?? null,
          },
      ...(debugOtp ? { _debug_otp: otpDigits } : {}),
    }),
  };
}
