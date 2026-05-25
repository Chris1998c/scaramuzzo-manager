import "server-only";

import { NextResponse } from "next/server";

import {
  getLinkBlock,
  MAX_VERIFY_ATTEMPTS,
} from "@/lib/customerClaim/claimShared";
import { verifyClaimOtp as checkOtpHash } from "@/lib/customerClaim/otpCrypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const OTP_PATTERN = /^\d{4,8}$/;

export function validateClaimOtpDigits(
  otpRaw: string,
): NextResponse | null {
  if (!OTP_PATTERN.test(otpRaw)) {
    return NextResponse.json(
      { success: false, error: "Codice OTP non valido." },
      { status: 400 },
    );
  }
  return null;
}

export type CompleteClaimOtpVerificationParams = {
  userId: string;
  customerId: string;
  otpRaw: string;
  linkMethod?: string;
  /** Se true, la risposta di successo include customer_id (flusso legacy customer_code). */
  includeCustomerIdInSuccess?: boolean;
};

export type CompleteClaimOtpVerificationResult =
  | { ok: true; response: NextResponse }
  | { ok: false; response: NextResponse };

/**
 * Verifica challenge OTP, crea customer_auth_links, pulisce challenge.
 * Condiviso tra verify-otp (codice) e verify-otp-by-phone.
 */
export async function completeClaimOtpVerification(
  params: CompleteClaimOtpVerificationParams,
): Promise<CompleteClaimOtpVerificationResult> {
  const {
    userId,
    customerId,
    otpRaw,
    linkMethod = "whatsapp_otp",
    includeCustomerIdInSuccess = false,
  } = params;

  const otpInvalid = validateClaimOtpDigits(otpRaw);
  if (otpInvalid) return { ok: false, response: otpInvalid };

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

  const { data: challenge, error: chErr } = await supabaseAdmin
    .from("customer_claim_otp_challenges")
    .select("id, otp_hash, expires_at, attempt_count")
    .eq("user_id", userId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (chErr) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Errore durante la verifica." },
        { status: 500 },
      ),
    };
  }

  if (!challenge) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Nessuna verifica in corso. Richiedi un nuovo codice.",
          code: "challenge_missing",
        },
        { status: 400 },
      ),
    };
  }

  const expiresAt = new Date(String(challenge.expires_at)).getTime();
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .delete()
      .eq("id", challenge.id);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Codice scaduto. Richiedi un nuovo codice.",
          code: "challenge_expired",
        },
        { status: 400 },
      ),
    };
  }

  const attempts = Number(challenge.attempt_count) || 0;
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .delete()
      .eq("id", challenge.id);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Troppi tentativi errati. Richiedi un nuovo codice.",
          code: "challenge_locked",
        },
        { status: 429 },
      ),
    };
  }

  const otpOk = checkOtpHash(otpRaw, String(challenge.otp_hash));

  if (!otpOk) {
    await supabaseAdmin
      .from("customer_claim_otp_challenges")
      .update({ attempt_count: attempts + 1 })
      .eq("id", challenge.id);

    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Codice non valido.",
          code: "otp_invalid",
          attempts_remaining: Math.max(0, MAX_VERIFY_ATTEMPTS - attempts - 1),
        },
        { status: 400 },
      ),
    };
  }

  await supabaseAdmin
    .from("customer_claim_otp_challenges")
    .delete()
    .eq("id", challenge.id);

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("customer_auth_links")
    .insert({
      customer_id: customerId,
      user_id: userId,
      link_method: linkMethod,
      verified_at: now,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    const msg = insErr.message ?? "";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: "Collegamento già esistente.",
            code: "link_conflict",
          },
          { status: 409 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Impossibile completare il collegamento." },
        { status: 500 },
      ),
    };
  }

  return {
    ok: true,
    response: NextResponse.json({
      success: true,
      link_id: inserted?.id ?? null,
      ...(includeCustomerIdInSuccess ? { customer_id: customerId } : {}),
    }),
  };
}
