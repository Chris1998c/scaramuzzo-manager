// lib/integrations/whatsappClaimOtp.ts
// WhatsApp Cloud API (Meta Graph): template con parametro body = OTP.

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v21.0";

export type SendClaimOtpParams = {
  /** Numero come in anagrafica (normalizzazione lato provider consigliata). */
  phoneRaw: string;
  otpDigits: string;
};

export type SendClaimOtpResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

/** Cifre solo, senza +; formato atteso da Graph API per `to`. */
function normalizePhoneForWhatsAppTo(phoneRaw: string): string | null {
  let d = phoneRaw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // Esempio IT: cellulare 10 cifre che inizia con 3 → prefisso 39
  if (d.length === 10 && d.startsWith("3")) d = `39${d}`;
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function graphMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

function summarizeMetaError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Risposta Meta non valida.";
  const err = (payload as { error?: { message?: string; error_user_msg?: string } })
    .error;
  const msg =
    err?.error_user_msg?.trim() ||
    err?.message?.trim() ||
    "Invio WhatsApp rifiutato.";
  return msg.length > 280 ? `${msg.slice(0, 277)}...` : msg;
}

/**
 * Invia OTP via WhatsApp (template approvato in Meta Business Manager).
 * Se mancano token o phone number id → `skipped` (stesso comportamento dello stub).
 * Con token + id servono anche nome template e lingua (vedi env sotto).
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

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: otp }],
        },
      ],
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(graphMessagesUrl(phoneId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok) {
      return {
        ok: false,
        error: summarizeMetaError(json),
      };
    }

    const messages = json?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        ok: false,
        error: summarizeMetaError(json),
      };
    }

    return { ok: true };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Timeout durante l'invio WhatsApp."
        : "Errore di rete durante l'invio WhatsApp.",
    };
  } finally {
    clearTimeout(t);
  }
}
