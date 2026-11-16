/**
 * Policy cancellazione fisica vs logica (P0 customer_app).
 * customer_app confermati: solo soft-cancel; mai hard-delete operativo.
 */

export const CUSTOMER_APP_SOURCE = "customer_app";

export const CUSTOMER_APP_NO_HARD_DELETE_MESSAGE =
  "Le prenotazioni dall'app clienti non possono essere eliminate: usa Annulla per mantenerle nello storico.";

export function isCustomerAppAppointmentSource(source: unknown): boolean {
  return String(source ?? "").trim().toLowerCase() === CUSTOMER_APP_SOURCE;
}

export function shouldHardDeleteAppointment(source: unknown): boolean {
  return !isCustomerAppAppointmentSource(source);
}
