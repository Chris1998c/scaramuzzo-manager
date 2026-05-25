import "server-only";

/**
 * Configurazione WhatsApp Cloud API per OTP claim cliente.
 *
 * Template Meta (es. categoria AUTHENTICATION o UTILITY):
 * - Nome: valore di WHATSAPP_OTP_TEMPLATE_NAME (es. `customer_otp_it`)
 * - Lingua: WHATSAPP_OTP_TEMPLATE_LANG (default `it`)
 * - Body: una variabile testo {{1}} = codice OTP a 6 cifre
 *
 * Payload Graph (POST /{phone-number-id}/messages):
 * ```json
 * {
 *   "messaging_product": "whatsapp",
 *   "to": "393895817411",
 *   "type": "template",
 *   "template": {
 *     "name": "<WHATSAPP_OTP_TEMPLATE_NAME>",
 *     "language": { "code": "it" },
 *     "components": [{
 *       "type": "body",
 *       "parameters": [{ "type": "text", "text": "123456" }]
 *     }]
 *   }
 * }
 * ```
 */

export type ClaimWhatsAppConfig =
  | {
      ok: true;
      accessToken: string;
      phoneNumberId: string;
      templateName: string;
      templateLanguageCode: string;
    }
  | {
      ok: false;
      code: "whatsapp_not_configured" | "whatsapp_template_not_configured";
      message: string;
      missingEnv: string[];
    };

export function resolveClaimWhatsAppConfig(): ClaimWhatsAppConfig {
  const missingEnv: string[] = [];
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
  const templateLanguageCode =
    process.env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() || "it";

  if (!accessToken) missingEnv.push("WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId) missingEnv.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!templateName) missingEnv.push("WHATSAPP_OTP_TEMPLATE_NAME");

  if (missingEnv.length > 0) {
    const templateOnly =
      missingEnv.length === 1 && missingEnv[0] === "WHATSAPP_OTP_TEMPLATE_NAME";
    return {
      ok: false,
      code: templateOnly
        ? "whatsapp_template_not_configured"
        : "whatsapp_not_configured",
      message: templateOnly
        ? "OTP WhatsApp non configurato: impostare WHATSAPP_OTP_TEMPLATE_NAME (template Meta approvato con {{1}} = codice OTP nel body)."
        : `OTP WhatsApp non configurato: impostare ${missingEnv.join(", ")} su Vercel.`,
      missingEnv,
    };
  }

  return {
    ok: true,
    accessToken: accessToken!,
    phoneNumberId: phoneNumberId!,
    templateName: templateName!,
    templateLanguageCode,
  };
}

/** In produzione l'invio reale è obbligatorio (niente success con delivery skipped). */
export function isClaimWhatsAppDeliveryRequired(): boolean {
  if (process.env.CUSTOMER_CLAIM_WHATSAPP_ALLOW_SKIP === "true") {
    return false;
  }
  if (process.env.NODE_ENV === "production") return true;
  return process.env.CUSTOMER_CLAIM_WHATSAPP_REQUIRED === "true";
}
