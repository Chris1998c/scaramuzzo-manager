// lib/integrations/whatsappClaimOtp.ts
// WhatsApp Cloud API (Meta Graph): OTP claim cliente (delega al core graph).
import {
  normalizePhoneForWhatsAppTo,
  sendWhatsAppTemplateMessage,
} from "@/lib/integrations/whatsappGraph";

export type SendClaimOtpParams = {
  /** Numero come in anagrafica (normalizzazione lato provider consigliata). */
  phoneRaw: string;
  otpDigits: string;
};

export type SendClaimOtpResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

/**
 * Invia OTP via WhatsApp (template approvato in Meta Business Manager).
 * Se mancano token o phone number id → `skipped` (stesso comportamento dello stub).
 */
export async function sendClaimOtpWhatsApp(
  params: SendClaimOtpParams
): Promise<SendClaimOtpResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!token || !phoneId) {
    return {
      ok: true,
      skipped: true,
      reason: "whatsapp_not_configured",
    };
  }

  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
  const templateLang =
    process.env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() || "it";

  if (!templateName) {
    return {
      ok: false,
      error:
        "Configurare WHATSAPP_OTP_TEMPLATE_NAME (template WhatsApp approvato con variabile OTP nel body).",
    };
  }

  const to = normalizePhoneForWhatsAppTo(params.phoneRaw);
  if (!to) {
    return {
      ok: false,
      error: "Numero di telefono non valido per l'invio WhatsApp.",
    };
  }

  const otp = String(params.otpDigits).trim();
  if (!/^\d{4,8}$/.test(otp)) {
    return { ok: false, error: "OTP non valido per l'invio." };
  }

  const send = await sendWhatsAppTemplateMessage({
    accessToken: token,
    phoneNumberId: phoneId,
    toDigits: to,
    templateName,
    templateLanguageCode: templateLang,
    bodyParameters: [otp],
  });

  if (!send.ok) {
    return { ok: false, error: send.error };
  }

  return { ok: true };
}
