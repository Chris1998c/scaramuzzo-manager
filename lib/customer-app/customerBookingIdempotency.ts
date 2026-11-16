import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CustomerAppBookingDto } from "@/lib/customer-app/createCustomerAppBooking";
import type { ParsedCustomerAppBookingBody } from "@/lib/customer-app/parseCustomerAppBookingBody";

export const MAX_CUSTOMER_BOOKING_IDEMPOTENCY_KEY_LENGTH = 128;

/** Record processing più vecchio → considerato abbandonato, si può riprovare. */
export const CUSTOMER_BOOKING_IDEMPOTENCY_STALE_MS = 5 * 60 * 1000;

/** Messaggio sicuro quando la response salvata punta a un appointment sparito/annullato. */
export const CUSTOMER_BOOKING_IDEMPOTENCY_GONE_MESSAGE =
  "La prenotazione non è più disponibile. Controlla «Le mie prenotazioni» oppure ripeti la richiesta con una nuova chiave.";

export type ParseIdempotencyKeyResult =
  | { ok: true; key: string | null }
  | { ok: false; error: string };

export function parseCustomerBookingIdempotencyKey(
  raw: string | null,
): ParseIdempotencyKeyResult {
  if (raw === null || raw === undefined) {
    return { ok: true, key: null };
  }
  const key = raw.trim();
  if (!key) {
    return { ok: false, error: "Idempotency-Key non valida" };
  }
  if (key.length > MAX_CUSTOMER_BOOKING_IDEMPOTENCY_KEY_LENGTH) {
    return {
      ok: false,
      error: `Idempotency-Key: massimo ${MAX_CUSTOMER_BOOKING_IDEMPOTENCY_KEY_LENGTH} caratteri`,
    };
  }
  return { ok: true, key };
}

/** Hash stabile del payload normalizzato (ordine service_ids incluso). */
export function hashCustomerBookingPayload(data: ParsedCustomerAppBookingBody): string {
  const normalized = {
    salon_id: data.salonId,
    service_ids: data.serviceIds,
    staff_id: data.staffId,
    start_time: data.startTime,
    notes: data.notes ?? null,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

type IdempotencyRow = {
  id: string;
  user_id: string;
  customer_id: string;
  idempotency_key: string;
  request_hash: string;
  booking_id: number | null;
  response: { booking?: CustomerAppBookingDto } | null;
  status: string;
  created_at: string;
};

export type BeginCustomerBookingIdempotencyResult =
  | { action: "proceed"; recordId: string | null }
  | { action: "replay"; booking: CustomerAppBookingDto }
  | { action: "conflict"; message: string };

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

function isProcessingStale(createdAt: string, nowMs = Date.now()): boolean {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return false;
  return nowMs - createdMs >= CUSTOMER_BOOKING_IDEMPOTENCY_STALE_MS;
}

function extractBookingFromResponse(
  response: IdempotencyRow["response"],
): CustomerAppBookingDto | null {
  const booking = response?.booking;
  if (!booking || typeof booking !== "object") return null;
  return booking as CustomerAppBookingDto;
}

async function loadIdempotencyRow(
  admin: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<IdempotencyRow | null> {
  const { data, error } = await admin
    .from("customer_booking_idempotency_keys")
    .select(
      "id, user_id, customer_id, idempotency_key, request_hash, booking_id, response, status, created_at",
    )
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(`loadIdempotencyRow: ${error.message}`);
  }
  return (data as IdempotencyRow | null) ?? null;
}

/** Esportato per test: decide replay/conflict/retry senza I/O. */
export function resolveExistingIdempotencyRow(
  row: IdempotencyRow,
  requestHash: string,
  nowMs: number,
): BeginCustomerBookingIdempotencyResult | { action: "retry" } {
  if (row.request_hash !== requestHash) {
    return {
      action: "conflict",
      message: "Idempotency-Key già usata con un payload diverso.",
    };
  }

  if (row.status === "success") {
    const booking = extractBookingFromResponse(row.response);
    if (booking) {
      return { action: "replay", booking };
    }
    return {
      action: "conflict",
      message: "Idempotency-Key in stato inconsistente. Riprova con una nuova chiave.",
    };
  }

  if (row.status === "processing") {
    // Create già riuscito ma complete fallito: response/booking_id presenti → replay.
    const partialBooking = extractBookingFromResponse(row.response);
    if (partialBooking) {
      return { action: "replay", booking: partialBooking };
    }
    if (isProcessingStale(row.created_at, nowMs)) {
      return { action: "retry" };
    }
    return {
      action: "conflict",
      message: "Richiesta già in elaborazione. Riprova tra poco.",
    };
  }

  // failed o stato sconosciuto → permette retry
  return { action: "retry" };
}

/**
 * Replay consentito solo se l'appointment esiste, è del cliente e non è terminale.
 * Evita 201 con ID fantasma (#142/#143).
 */
export async function verifyIdempotencyReplayBooking(
  admin: SupabaseClient,
  booking: CustomerAppBookingDto,
  customerId: string,
): Promise<{ ok: true } | { ok: false }> {
  const bookingId = Number(booking.id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return { ok: false };
  }

  const { data, error } = await admin
    .from("appointments")
    .select("id, customer_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false };
  }

  const rowCustomer = String(
    (data as { customer_id?: unknown }).customer_id ?? "",
  ).trim();
  if (rowCustomer !== customerId) {
    return { ok: false };
  }

  const status = String((data as { status?: unknown }).status ?? "")
    .trim()
    .toLowerCase();
  if (
    status === "cancelled" ||
    status === "no_show" ||
    status === "noshow" ||
    status === "done"
  ) {
    return { ok: false };
  }

  return { ok: true };
}

export async function beginCustomerBookingIdempotency(
  admin: SupabaseClient,
  input: {
    userId: string;
    customerId: string;
    idempotencyKey: string | null;
    requestHash: string;
    nowMs?: number;
  },
): Promise<BeginCustomerBookingIdempotencyResult> {
  if (!input.idempotencyKey) {
    return { action: "proceed", recordId: null };
  }

  const nowMs = input.nowMs ?? Date.now();

  const { data: inserted, error: insertErr } = await admin
    .from("customer_booking_idempotency_keys")
    .insert({
      user_id: input.userId,
      customer_id: input.customerId,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      status: "processing",
    })
    .select("id")
    .single();

  if (!insertErr) {
    return { action: "proceed", recordId: String((inserted as { id: string }).id) };
  }

  if (!isUniqueViolation(insertErr)) {
    throw new Error(`beginCustomerBookingIdempotency insert: ${insertErr.message}`);
  }

  const existing = await loadIdempotencyRow(admin, input.userId, input.idempotencyKey);
  if (!existing) {
    throw new Error("beginCustomerBookingIdempotency: unique conflict but row missing");
  }

  if (String(existing.customer_id).trim() !== input.customerId) {
    return {
      action: "conflict",
      message: "Idempotency-Key non valida per questo account.",
    };
  }

  const resolved = resolveExistingIdempotencyRow(existing, input.requestHash, nowMs);
  if (resolved.action === "replay") {
    const verified = await verifyIdempotencyReplayBooking(
      admin,
      resolved.booking,
      input.customerId,
    );
    if (!verified.ok) {
      return {
        action: "conflict",
        message: CUSTOMER_BOOKING_IDEMPOTENCY_GONE_MESSAGE,
      };
    }
    // Promote processing→success quando il booking era già stato creato (complete fallito).
    if (existing.status === "processing") {
      await admin
        .from("customer_booking_idempotency_keys")
        .update({
          status: "success",
          booking_id: resolved.booking.id,
          response: { booking: resolved.booking },
        })
        .eq("id", existing.id);
    }
    return resolved;
  }
  if (resolved.action !== "retry") {
    return resolved;
  }

  await admin.from("customer_booking_idempotency_keys").delete().eq("id", existing.id);

  const { data: reinserted, error: reinsertErr } = await admin
    .from("customer_booking_idempotency_keys")
    .insert({
      user_id: input.userId,
      customer_id: input.customerId,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      status: "processing",
    })
    .select("id")
    .single();

  if (!reinsertErr) {
    return { action: "proceed", recordId: String((reinserted as { id: string }).id) };
  }

  if (isUniqueViolation(reinsertErr)) {
    const again = await loadIdempotencyRow(admin, input.userId, input.idempotencyKey);
    if (again) {
      const againResolved = resolveExistingIdempotencyRow(again, input.requestHash, nowMs);
      if (againResolved.action === "replay") {
        const verified = await verifyIdempotencyReplayBooking(
          admin,
          againResolved.booking,
          input.customerId,
        );
        if (!verified.ok) {
          return {
            action: "conflict",
            message: CUSTOMER_BOOKING_IDEMPOTENCY_GONE_MESSAGE,
          };
        }
        return againResolved;
      }
      if (againResolved.action !== "retry") {
        return againResolved;
      }
    }
    return {
      action: "conflict",
      message: "Richiesta già in elaborazione. Riprova tra poco.",
    };
  }

  throw new Error(`beginCustomerBookingIdempotency reinsert: ${reinsertErr.message}`);
}

export async function completeCustomerBookingIdempotency(
  admin: SupabaseClient,
  recordId: string,
  booking: CustomerAppBookingDto,
): Promise<void> {
  const { error } = await admin
    .from("customer_booking_idempotency_keys")
    .update({
      status: "success",
      booking_id: booking.id,
      response: { booking },
    })
    .eq("id", recordId)
    .eq("status", "processing");

  if (error) {
    throw new Error(`completeCustomerBookingIdempotency: ${error.message}`);
  }
}

/**
 * Dopo create riuscita: completa la chiave; se fallisce, persiste comunque
 * booking_id+response così un retry riplaya lo stesso booking (niente secondo insert).
 */
export async function finalizeCustomerBookingIdempotency(
  admin: SupabaseClient,
  recordId: string,
  booking: CustomerAppBookingDto,
): Promise<void> {
  try {
    await completeCustomerBookingIdempotency(admin, recordId, booking);
    return;
  } catch (completeErr) {
    console.error(
      "completeCustomerBookingIdempotency:",
      completeErr instanceof Error ? completeErr.message : completeErr,
    );
  }

  const { error } = await admin
    .from("customer_booking_idempotency_keys")
    .update({
      booking_id: booking.id,
      response: { booking },
      // lascia processing se lo status update fallisce; begin riplaya da response
      status: "success",
    })
    .eq("id", recordId);

  if (error) {
    // Ultimo tentativo: almeno response/booking_id senza forzare status
    const { error: attachErr } = await admin
      .from("customer_booking_idempotency_keys")
      .update({
        booking_id: booking.id,
        response: { booking },
      })
      .eq("id", recordId);
    if (attachErr) {
      throw new Error(
        `finalizeCustomerBookingIdempotency: ${error.message}; attach: ${attachErr.message}`,
      );
    }
  }
}

/** Rimuove record processing/failed per permettere retry (errori 4xx/5xx o crash recovery). */
export async function releaseCustomerBookingIdempotency(
  admin: SupabaseClient,
  recordId: string,
): Promise<void> {
  const { error } = await admin
    .from("customer_booking_idempotency_keys")
    .delete()
    .eq("id", recordId);

  if (error) {
    throw new Error(`releaseCustomerBookingIdempotency: ${error.message}`);
  }
}
