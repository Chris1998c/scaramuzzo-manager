export type AgendaLifecycleTarget = "cancelled" | "no_show";

export function normalizeAgendaStatus(status: unknown): string {
  return String(status ?? "scheduled").trim().toLowerCase();
}

export function hasAppointmentSale(saleId: unknown): boolean {
  return saleId != null && saleId !== "";
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
