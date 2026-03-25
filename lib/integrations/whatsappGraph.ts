// lib/integrations/whatsappGraph.ts
// Core WhatsApp Cloud API (Meta Graph): normalizzazione telefono + invio template.
import "server-only";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v21.0";

/** Cifre senza +; formato `to` richiesto da Graph API. */
export function normalizePhoneForWhatsAppTo(phoneRaw: string): string | null {
  let d = phoneRaw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = `39${d}`;
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export function whatsappGraphMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

export function summarizeWhatsAppGraphError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Risposta Meta non valida.";
  const err = (payload as { error?: { message?: string; error_user_msg?: string } })
    .error;
  const msg =
    err?.error_user_msg?.trim() ||
    err?.message?.trim() ||
    "Invio WhatsApp rifiutato.";
  return msg.length > 280 ? `${msg.slice(0, 277)}...` : msg;
}

export type SendWhatsAppTemplateParams = {
  accessToken: string;
  phoneNumberId: string;
  /** Destinatario: solo cifre, senza + */
  toDigits: string;
  templateName: string;
  templateLanguageCode: string;
  /** Parametri body in ordine ({{1}}, {{2}}, …). */
  bodyParameters: string[];
};

export type SendWhatsAppTemplateResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

export type SendWhatsAppTextParams = {
  accessToken: string;
  phoneNumberId: string;
  /** Destinatario: solo cifre, senza + */
  toDigits: string;
  /** Corpo messaggio (limite API Meta, tronchiamo in difesa). */
  body: string;
};

export type SendWhatsAppTextResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string };

const WHATSAPP_TEXT_MAX = 4096;

/**
 * POST /{phone-number-id}/messages — messaggio di testo (funziona in finestra conversazione Meta;
 * fuori finestra / policy marketing l'API può rifiutare: gestire a livello chiamante).
 */
export async function sendWhatsAppTextMessage(
  params: SendWhatsAppTextParams,
): Promise<SendWhatsAppTextResult> {
  const textBody = String(params.body ?? "").slice(0, WHATSAPP_TEXT_MAX);
  if (!textBody.trim()) {
    return { ok: false, error: "Messaggio vuoto." };
  }

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.toDigits,
    type: "text",
    text: {
      preview_url: false,
      body: textBody,
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(whatsappGraphMessagesUrl(params.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
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
      return { ok: false, error: summarizeWhatsAppGraphError(json) };
    }

    const messages = json?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, error: summarizeWhatsAppGraphError(json) };
    }

    const mid = (messages[0] as { id?: string })?.id ?? null;
    return { ok: true, providerMessageId: mid };
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

/**
 * POST /{phone-number-id}/messages — template con N parametri testo nel body.
 */
export async function sendWhatsAppTemplateMessage(
  params: SendWhatsAppTemplateParams
): Promise<SendWhatsAppTemplateResult> {
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.toDigits,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.templateLanguageCode },
      components: [
        {
          type: "body",
          parameters: params.bodyParameters.map((text) => ({
            type: "text",
            text: String(text).slice(0, 1024),
          })),
        },
      ],
    },
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(whatsappGraphMessagesUrl(params.phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
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
      return { ok: false, error: summarizeWhatsAppGraphError(json) };
    }

    const messages = json?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, error: summarizeWhatsAppGraphError(json) };
    }

    const mid = (messages[0] as { id?: string })?.id ?? null;
    return { ok: true, providerMessageId: mid };
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
