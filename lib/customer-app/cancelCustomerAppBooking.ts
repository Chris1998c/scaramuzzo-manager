import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canCustomerCancelBooking } from "@/lib/customer-app/canCustomerCancelBooking";

export type CustomerAppCancelledBookingDto = {
  id: number;
  status: "cancelled";
};

export class CustomerAppBookingCancelNotFoundError extends Error {
  constructor() {
    super("Prenotazione non trovata.");
    this.name = "CustomerAppBookingCancelNotFoundError";
  }
}

export class CustomerAppBookingCancelForbiddenError extends Error {
  constructor() {
    super("Non autorizzato ad annullare questa prenotazione.");
    this.name = "CustomerAppBookingCancelForbiddenError";
  }
}

export class CustomerAppBookingCancelConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerAppBookingCancelConflictError";
  }
}

export async function cancelCustomerAppBooking(
  admin: SupabaseClient,
  customerId: string,
  bookingId: number,
): Promise<CustomerAppCancelledBookingDto> {
  // Filtra per customer_id: booking altrui → 404 (niente oracle 403 vs 404).
  const { data: appt, error: fetchErr } = await admin
    .from("appointments")
    .select("id, customer_id, status, sale_id, source, start_time")
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`cancelCustomerAppBooking fetch: ${fetchErr.message}`);
  }

  if (!appt) {
    throw new CustomerAppBookingCancelNotFoundError();
  }

  const cancelCheck = canCustomerCancelBooking({
    status: appt.status,
    sale_id: appt.sale_id,
    source: appt.source,
    start_time: appt.start_time,
  });

  if (!cancelCheck.allowed) {
    throw new CustomerAppBookingCancelConflictError(cancelCheck.reason);
  }

  const { data: updated, error: updErr } = await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .eq("status", "scheduled")
    .select("id, status")
    .maybeSingle();

  if (updErr) {
    throw new Error(`cancelCustomerAppBooking update: ${updErr.message}`);
  }

  if (!updated) {
    throw new CustomerAppBookingCancelConflictError(
      "Impossibile annullare: lo stato della prenotazione è cambiato.",
    );
  }

  return {
    id: Number(updated.id),
    status: "cancelled",
  };
}
