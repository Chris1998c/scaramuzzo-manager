// lib/integrations/whatsappGraph.ts
// Core WhatsApp Cloud API (Meta Graph): normalizzazione telefono + invio template.
import "server-only";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v21.0";

/**
 * Destinatario Meta Graph: solo cifre, prefisso paese IT (39) senza +.
 * Es. 3895817411 → 393895817411; +393895817411 → 393895817411.
 */
export function normalizePhoneForWhatsAppTo(phoneRaw: string): string | null {
  let d = phoneRaw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length >= 10) d = d.slice(1);

  if (d.startsWith("39") && d.length >= 11) {
    return d.length <= 15 ? d : null;
  }

  if (/^3\d{8,}$/.test(d)) {
    const international = `39${d}`;
    return international.length <= 15 ? international : null;
  }

  if (d.length >= 8 && d.length <= 15) return d;
  return null;
}

/** Mascheramento per log (mai OTP/token). */
export function maskWhatsAppToDigits(toDigits: string): string {
  const d = toDigits.replace(/\D/g, "");
  if (d.length <= 4) return "****";
  return `${d.slice(0, 2)}***${d.slice(-3)}`;
}

export type WhatsAppGraphErrorDetails = {
  message: string;
  httpStatus?: number;
  code?: number;
  errorSubcode?: number;
  type?: string;
  fbtraceId?: string;
};

export function parseWhatsAppGraphErrorPayload(
  payload: unknown,
  httpStatus?: number,
): WhatsAppGraphErrorDetails {
  const err =
    payload && typeof payload === "object"
      ? (payload as {
          error?: {
            message?: string;
            error_user_msg?: string;
            code?: number;
            error_subcode?: number;
            type?: string;
            fbtrace_id?: string;
          };
        }).error
      : undefined;

  const message =
    err?.error_user_msg?.trim() ||
    err?.message?.trim() ||
    "Invio WhatsApp rifiutato.";

  return {
    message: message.length > 280 ? `${message.slice(0, 277)}...` : message,
    httpStatus,
    code: typeof err?.code === "number" ? err.code : undefined,
    errorSubcode:
      typeof err?.error_subcode === "number" ? err.error_subcode : undefined,
    type: typeof err?.type === "string" ? err.type : undefined,
    fbtraceId: typeof err?.fbtrace_id === "string" ? err.fbtrace_id : undefined,
  };
}

export function whatsappGraphMessagesUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

export function summarizeWhatsAppGraphError(
  payload: unknown,
  httpStatus?: number,
): string {
  return parseWhatsAppGraphErrorPayload(payload, httpStatus).message;
}

function logWhatsAppGraphSuccess(
  context: string,
  meta: {
    httpStatus: number;
    toDigits: string;
    templateName?: string;
    providerMessageId: string | null;
  },
): void {
  console.info(`[whatsapp-graph] ${context} ok`, {
    status: meta.httpStatus,
    to: maskWhatsAppToDigits(meta.toDigits),
    template: meta.templateName,
    messageId: meta.providerMessageId,
  });
}

function logWhatsAppGraphFailure(
  context: string,
  meta: {
    httpStatus: number;
    toDigits: string;
    templateName?: string;
    details: WhatsAppGraphErrorDetails;
  },
): void {
  console.error(`[whatsapp-graph] ${context} fail`, {
    status: meta.httpStatus,
    to: maskWhatsAppToDigits(meta.toDigits),
    template: meta.templateName,
    code: meta.details.code,
    errorSubcode: meta.details.errorSubcode,
    type: meta.details.type,
    message: meta.details.message,
    fbtraceId: meta.details.fbtraceId,
  });
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
      const details = parseWhatsAppGraphErrorPayload(json, res.status);
      logWhatsAppGraphFailure("text", {
        httpStatus: res.status,
        toDigits: params.toDigits,
        details,
      });
      return { ok: false, error: details.message };
    }

    const messages = json?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      const details = parseWhatsAppGraphErrorPayload(json, res.status);
      logWhatsAppGraphFailure("text", {
        httpStatus: res.status,
        toDigits: params.toDigits,
        details,
      });
      return { ok: false, error: details.message };
    }

    const mid = (messages[0] as { id?: string })?.id ?? null;
    logWhatsAppGraphSuccess("text", {
      httpStatus: res.status,
      toDigits: params.toDigits,
      providerMessageId: mid,
    });
    return { ok: true, providerMessageId: mid };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error("[whatsapp-graph] text network", {
      to: maskWhatsAppToDigits(params.toDigits),
      aborted,
    });
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
  params: SendWhatsAppTemplateParams,
  logContext = "template",
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
      const details = parseWhatsAppGraphErrorPayload(json, res.status);
      logWhatsAppGraphFailure(logContext, {
        httpStatus: res.status,
        toDigits: params.toDigits,
        templateName: params.templateName,
        details,
      });
      return { ok: false, error: details.message };
    }

    const messages = json?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      const details = parseWhatsAppGraphErrorPayload(json, res.status);
      logWhatsAppGraphFailure(logContext, {
        httpStatus: res.status,
        toDigits: params.toDigits,
        templateName: params.templateName,
        details,
      });
      return { ok: false, error: details.message };
    }

    const mid = (messages[0] as { id?: string })?.id ?? null;
    logWhatsAppGraphSuccess(logContext, {
      httpStatus: res.status,
      toDigits: params.toDigits,
      templateName: params.templateName,
      providerMessageId: mid,
    });
    return { ok: true, providerMessageId: mid };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error(`[whatsapp-graph] ${logContext} network`, {
      to: maskWhatsAppToDigits(params.toDigits),
      template: params.templateName,
      aborted,
    });
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
