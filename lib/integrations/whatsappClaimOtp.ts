// lib/integrations/whatsappClaimOtp.ts
// WhatsApp Cloud API (Meta Graph): OTP claim cliente.
import {
  maskWhatsAppToDigits,
  normalizePhoneForWhatsAppTo,
  sendWhatsAppTemplateMessage,
} from "@/lib/integrations/whatsappGraph";
import {
  isClaimWhatsAppDeliveryRequired,
  resolveClaimWhatsAppConfig,
} from "@/lib/integrations/whatsappClaimConfig";

export type SendClaimOtpParams = {
  /** Numero come in anagrafica (normalizzato a 39… per Meta). */
  phoneRaw: string;
  otpDigits: string;
};

export type SendClaimOtpResult =
  | { ok: true; skipped?: false; providerMessageId?: string | null }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string; code?: string };

/**
 * Invia OTP via WhatsApp (template approvato in Meta Business Manager).
 * In produzione: env mancanti o invio fallito → errore (no success silenzioso).
 */
export async function sendClaimOtpWhatsApp(
  params: SendClaimOtpParams,
): Promise<SendClaimOtpResult> {
  const cfg = resolveClaimWhatsAppConfig();
  const deliveryRequired = isClaimWhatsAppDeliveryRequired();

  if (!cfg.ok) {
    console.error("[claim-otp-whatsapp] config missing", {
      code: cfg.code,
      missingEnv: cfg.missingEnv,
      deliveryRequired,
    });
    if (deliveryRequired) {
      return { ok: false, error: cfg.message, code: cfg.code };
    }
    return {
      ok: true,
      skipped: true,
      reason: cfg.code,
    };
  }

  const to = normalizePhoneForWhatsAppTo(params.phoneRaw);
  if (!to) {
    return {
      ok: false,
      error: "Numero di telefono non valido per l'invio WhatsApp.",
      code: "phone_invalid_for_whatsapp",
    };
  }

  const otp = String(params.otpDigits).trim();
  if (!/^\d{4,8}$/.test(otp)) {
    return { ok: false, error: "OTP non valido per l'invio.", code: "otp_invalid" };
  }

  const send = await sendWhatsAppTemplateMessage(
    {
      accessToken: cfg.accessToken,
      phoneNumberId: cfg.phoneNumberId,
      toDigits: to,
      templateName: cfg.templateName,
      templateLanguageCode: cfg.templateLanguageCode,
      bodyParameters: [otp],
    },
    "claim-otp",
  );

  if (!send.ok) {
    return {
      ok: false,
      error: send.error,
      code: "whatsapp_send_failed",
    };
  }

  console.info("[claim-otp-whatsapp] queued", {
    to: maskWhatsAppToDigits(to),
    template: cfg.templateName,
    lang: cfg.templateLanguageCode,
    messageId: send.providerMessageId,
  });

  return { ok: true, providerMessageId: send.providerMessageId };
}
