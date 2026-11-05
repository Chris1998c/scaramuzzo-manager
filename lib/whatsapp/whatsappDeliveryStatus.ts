/** Stati consegna Meta (webhook statuses). Distinti da status Graph (pending/sent/failed/skipped). */
export const WHATSAPP_DELIVERY_STATUSES = [
  "sent",
  "delivered",
  "read",
  "failed",
] as const;

export type WhatsAppDeliveryStatus = (typeof WHATSAPP_DELIVERY_STATUSES)[number];

export function isWhatsAppDeliveryStatus(
  value: string,
): value is WhatsAppDeliveryStatus {
  return (WHATSAPP_DELIVERY_STATUSES as readonly string[]).includes(value);
}

/** Ordine monotono: sent < delivered < read. failed è terminale (non regredisce). */
const DELIVERY_RANK: Record<WhatsAppDeliveryStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

/**
 * Decide se applicare un nuovo stato consegna senza regressioni.
 * Duplicati → ignore. Fuori ordine (es. delivered dopo read) → ignore.
 * Eccezione Meta: dopo `failed` possono arrivare `delivered`/`read` (retry carrier).
 */
export function shouldApplyDeliveryStatus(
  current: string | null | undefined,
  incoming: WhatsAppDeliveryStatus,
): boolean {
  const cur = String(current ?? "").trim().toLowerCase();
  if (!cur) return true;
  if (!isWhatsAppDeliveryStatus(cur)) return true;
  if (cur === incoming) return false;
  if (cur === "read") return false;
  if (cur === "failed") {
    return incoming === "delivered" || incoming === "read";
  }
  return DELIVERY_RANK[incoming] > DELIVERY_RANK[cur];
}

/** Ordina eventi per timestamp provider (numerico se possibile) poi per rank. */
export function sortDeliveryEventsForReplay<
  T extends { deliveryStatus: WhatsAppDeliveryStatus; providerTimestamp: string },
>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const ta = Number(a.providerTimestamp);
    const tb = Number(b.providerTimestamp);
    const aNum = Number.isFinite(ta);
    const bNum = Number.isFinite(tb);
    if (aNum && bNum && ta !== tb) return ta - tb;
    if (a.providerTimestamp !== b.providerTimestamp) {
      return a.providerTimestamp.localeCompare(b.providerTimestamp);
    }
    return DELIVERY_RANK[a.deliveryStatus] - DELIVERY_RANK[b.deliveryStatus];
  });
}

export type ParsedWhatsAppStatusEvent = {
  providerMessageId: string;
  deliveryStatus: WhatsAppDeliveryStatus;
  providerTimestamp: string;
  errorMessage: string | null;
};

/**
 * Estrae eventi status dal payload webhook Meta WhatsApp Cloud API.
 */
export function parseWhatsAppStatusEvents(payload: unknown): ParsedWhatsAppStatusEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { entry?: unknown };
  if (!Array.isArray(root.entry)) return [];

  const out: ParsedWhatsAppStatusEvent[] = [];

  for (const entry of root.entry) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const statuses = (value as { statuses?: unknown }).statuses;
      if (!Array.isArray(statuses)) continue;

      for (const st of statuses) {
        if (!st || typeof st !== "object") continue;
        const row = st as {
          id?: unknown;
          status?: unknown;
          timestamp?: unknown;
          errors?: unknown;
        };
        const id = String(row.id ?? "").trim();
        const statusRaw = String(row.status ?? "").trim().toLowerCase();
        if (!id || !isWhatsAppDeliveryStatus(statusRaw)) continue;

        let errorMessage: string | null = null;
        if (Array.isArray(row.errors) && row.errors.length > 0) {
          const first = row.errors[0] as { message?: unknown; title?: unknown };
          const msg = String(first?.message ?? first?.title ?? "").trim();
          errorMessage = msg ? msg.slice(0, 2000) : null;
        }

        out.push({
          providerMessageId: id,
          deliveryStatus: statusRaw,
          providerTimestamp: String(row.timestamp ?? "").trim(),
          errorMessage,
        });
      }
    }
  }

  return out;
}

export function deliveryStatusLabel(status: string | null | undefined): string {
  const v = String(status ?? "").toLowerCase().trim();
  if (v === "sent") return "Accettato carrier";
  if (v === "delivered") return "Consegnato";
  if (v === "read") return "Letto";
  if (v === "failed") return "Consegna fallita";
  return "—";
}
