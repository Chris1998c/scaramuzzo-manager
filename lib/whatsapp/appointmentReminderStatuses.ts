/** Stati canonici log reminder appuntamento WhatsApp. */
export const APPOINTMENT_REMINDER_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;

export type AppointmentReminderStatus =
  (typeof APPOINTMENT_REMINDER_STATUSES)[number];

export function isAppointmentReminderStatus(
  value: string,
): value is AppointmentReminderStatus {
  return (APPOINTMENT_REMINDER_STATUSES as readonly string[]).includes(value);
}

/** Mappa stati legacy (pre-restore) per report. */
export function normalizeReminderStatusForDisplay(status: string): string {
  const v = status.toLowerCase().trim();
  if (v === "error") return "failed";
  if (v === "processing") return "pending";
  return v;
}

/** Etichetta UI per accettazione Graph (distinta dalla consegna webhook). */
export function graphReminderStatusLabel(status: string): string {
  const v = normalizeReminderStatusForDisplay(status);
  if (v === "sent") return "Accettato Graph";
  if (v === "failed") return "Errore Graph";
  if (v === "skipped") return "Saltato";
  if (v === "pending") return "In coda";
  return status || "—";
}
