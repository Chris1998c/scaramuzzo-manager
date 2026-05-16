/**
 * Configurazione fail-closed per customer claim (manual + OTP).
 * server-side APIs must validate actor before exposing claim flows.
 */

const DEV_PEPPER_PLACEHOLDER = "dev-only-change-in-production";

export function isManualClaimAllowed(): boolean {
  return process.env.CUSTOMER_CLAIM_ALLOW_CODE_MANUAL === "true";
}

export function manualClaimDisabledMessage(): string {
  return "Collegamento manuale non abilitato. Usa la verifica OTP (WhatsApp) dal portale cliente.";
}

export type OtpPepperResolution =
  | { ok: true; pepper: string }
  | { ok: false; message: string; code: "otp_not_configured" };

/** Pepper obbligatorio per generare/verificare OTP; nessun default in dev/prod. */
export function resolveCustomerClaimOtpPepper(): OtpPepperResolution {
  const raw = process.env.CUSTOMER_CLAIM_OTP_PEPPER;
  const pepper = typeof raw === "string" ? raw.trim() : "";

  if (!pepper) {
    return {
      ok: false,
      message:
        "Verifica OTP non disponibile: CUSTOMER_CLAIM_OTP_PEPPER non configurato.",
      code: "otp_not_configured",
    };
  }

  if (pepper === DEV_PEPPER_PLACEHOLDER) {
    return {
      ok: false,
      message:
        "Verifica OTP non disponibile: sostituire CUSTOMER_CLAIM_OTP_PEPPER con un segreto di produzione.",
      code: "otp_not_configured",
    };
  }

  return { ok: true, pepper };
}

export function isCustomerClaimDebugOtpEnabled(): boolean {
  return process.env.CUSTOMER_CLAIM_DEBUG_OTP === "true";
}
