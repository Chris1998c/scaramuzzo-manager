export type AgendaLifecycleTarget = "cancelled" | "no_show";

export function normalizeAgendaStatus(status: unknown): string {
  return String(status ?? "scheduled").trim().toLowerCase();
}

export function hasAppointmentSale(saleId: unknown): boolean {
  return saleId != null && saleId !== "";
}

const TERMINAL_APPOINTMENT_STATUSES = new Set([
  "done",
  "cancelled",
  "no_show",
  "noshow",
]);

export const APPOINTMENT_LINE_CLOSED_MESSAGE =
  "Appuntamento chiuso: modifica non consentita";

export const APPOINTMENT_LINE_SALE_LOCKED_MESSAGE =
  "Appuntamento collegato a una vendita: modifica non consentita";

/** Blocco PATCH righe agenda (drag/resize/staff) — allineato a ServiceBox read-only. */
export function canModifyAppointmentAgendaLine(input: {
  status: unknown;
  sale_id?: unknown;
}): { allowed: true } | { allowed: false; error: string } {
  const s = normalizeAgendaStatus(input.status);
  if (TERMINAL_APPOINTMENT_STATUSES.has(s)) {
    return { allowed: false, error: APPOINTMENT_LINE_CLOSED_MESSAGE };
  }
  if (hasAppointmentSale(input.sale_id)) {
    return { allowed: false, error: APPOINTMENT_LINE_SALE_LOCKED_MESSAGE };
  }
  return { allowed: true };
}

/**
 * Regole condivise UI + API per annulla / no-show (nessuna cancellazione record).
 */
export function canSetAppointmentLifecycleStatus(input: {
  status: unknown;
  sale_id?: unknown;
  target: AgendaLifecycleTarget;
}): { allowed: boolean; reason: string | null } {
  if (hasAppointmentSale(input.sale_id)) {
    return {
      allowed: false,
      reason: "Appuntamento collegato a una vendita: azione non disponibile.",
    };
  }

  const s = normalizeAgendaStatus(input.status);

  if (s === "done") {
    return { allowed: false, reason: "Appuntamento già completato." };
  }

  if (s === "cancelled") {
    return {
      allowed: false,
      reason:
        input.target === "cancelled"
          ? "Già segnato come annullato."
          : "Appuntamento annullato: non applicabile no-show.",
    };
  }

  if (s === "no_show" || s === "noshow") {
    return {
      allowed: false,
      reason:
        input.target === "no_show"
          ? "Già segnato come no-show."
          : "Appuntamento no-show: non applicabile annulla.",
    };
  }

  if (input.target === "no_show" && s === "in_sala") {
    return { allowed: false, reason: "Cliente in sala: no-show non applicabile." };
  }

  return { allowed: true, reason: null };
}

export function canShowLifecycleActions(input: {
  status: unknown;
  sale_id?: unknown;
}): boolean {
  if (hasAppointmentSale(input.sale_id)) return false;
  const s = normalizeAgendaStatus(input.status);
  if (s === "done" || s === "cancelled" || s === "no_show" || s === "noshow") return false;
  return true;
}
