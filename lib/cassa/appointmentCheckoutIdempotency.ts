/** Chiave canonica allineata a close_sale_atomic (stesso unique sales_salon_idempotency_key). */
export function appointmentCheckoutIdempotencyKey(appointmentId: number): string {
  return `appointment:${appointmentId}`;
}
