import { nowRomeLocalDate, parseLocal, snapToAgendaSlot } from "@/lib/agenda/agendaContract";
import {
  canSetAppointmentLifecycleStatus,
  normalizeAgendaStatus,
} from "@/lib/agenda/appointmentLifecycle";

/** Sorgenti annullabili dall'app clienti (escluso walk_in). */
const CUSTOMER_CANCEL_ALLOWED_SOURCES = new Set(["customer_app", "booking"]);

export type CustomerCancelBookingInput = {
  status: unknown;
  sale_id: unknown;
  source: unknown;
  start_time: unknown;
  /** Solo test: timestamp fissato per stabilità. */
  nowMs?: number;
};

export type CustomerCancelBookingCheck =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Regole MVP cancellazione cliente.
 * TODO: finestra minima ore prima dell'appuntamento (non presente in repo agenda).
 */
export function canCustomerCancelBooking(
  input: CustomerCancelBookingInput,
): CustomerCancelBookingCheck {
  const gate = canSetAppointmentLifecycleStatus({
    status: input.status,
    sale_id: input.sale_id,
    target: "cancelled",
  });
  if (!gate.allowed) {
    return { allowed: false, reason: gate.reason ?? "Cancellazione non consentita." };
  }

  const status = normalizeAgendaStatus(input.status);
  if (status !== "scheduled") {
    if (status === "in_sala") {
      return { allowed: false, reason: "Cliente in sala: annullamento non disponibile dall'app." };
    }
    return {
      allowed: false,
      reason: "Solo gli appuntamenti prenotati possono essere annullati dall'app.",
    };
  }

  const source = String(input.source ?? "")
    .trim()
    .toLowerCase();
  if (!CUSTOMER_CANCEL_ALLOWED_SOURCES.has(source)) {
    return {
      allowed: false,
      reason: "Questo appuntamento non può essere annullato dall'app clienti.",
    };
  }

  const startTime = String(input.start_time ?? "").trim();
  if (!startTime || !isAppointmentStartInFuture(startTime, input.nowMs)) {
    return {
      allowed: false,
      reason: "Non è possibile annullare un appuntamento già iniziato o passato.",
    };
  }

  return { allowed: true };
}

export function isAppointmentStartInFuture(startTime: string, nowMs?: number): boolean {
  const slotMs = parseLocal(startTime).getTime();
  if (!Number.isFinite(slotMs)) return false;
  const now =
    nowMs != null
      ? snapToAgendaSlot(new Date(nowMs))
      : snapToAgendaSlot(nowRomeLocalDate());
  return slotMs >= now.getTime();
}
