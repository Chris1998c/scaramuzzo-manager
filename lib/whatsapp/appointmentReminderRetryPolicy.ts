/** Max tentativi di reinvio dopo un failed recuperabile (oltre al primo invio). */
export const APPOINTMENT_REMINDER_MAX_RETRIES = 3;

/** Backoff (ms) per retry_count corrente prima del prossimo tentativo. */
const BACKOFF_MS = [
  15 * 60 * 1000, // 15 min
  60 * 60 * 1000, // 1 h
  4 * 60 * 60 * 1000, // 4 h
] as const;

export type GraphFailureClass = {
  retryable: boolean;
  httpStatus?: number;
  code?: number;
};

/**
 * Solo errori con risposta Graph/HTTP esplicita e tipicamente transienti.
 * Timeout / abort / rete ambigua → non retryable (rischio doppio messaggio).
 */
export function classifyWhatsAppGraphFailure(params: {
  httpStatus?: number | null;
  code?: number | null;
  aborted?: boolean;
  networkWithoutResponse?: boolean;
}): GraphFailureClass {
  if (params.aborted || params.networkWithoutResponse) {
    return {
      retryable: false,
      httpStatus: params.httpStatus ?? undefined,
      code: params.code ?? undefined,
    };
  }

  const http = params.httpStatus ?? undefined;
  const code = params.code ?? undefined;

  if (http === 429 || http === 500 || http === 502 || http === 503) {
    return { retryable: true, httpStatus: http, code };
  }

  // Rate limit / temporary Meta (documentati come transienti).
  if (code === 130429 || code === 131048 || code === 133016) {
    return { retryable: true, httpStatus: http, code };
  }

  return { retryable: false, httpStatus: http, code };
}

/**
 * @param retryCountAfterFailure - tentativi di retry già consumati (0 = primo fail Graph,
 *   1 = fallito il primo retry, …). Massimo `APPOINTMENT_REMINDER_MAX_RETRIES` retry.
 */
export function computeNextRetryAt(
  retryCountAfterFailure: number,
  now = new Date(),
): Date | null {
  if (retryCountAfterFailure < 0) return null;
  if (retryCountAfterFailure >= APPOINTMENT_REMINDER_MAX_RETRIES) return null;
  const idx = Math.min(retryCountAfterFailure, BACKOFF_MS.length - 1);
  return new Date(now.getTime() + BACKOFF_MS[idx]!);
}

/** Lease anti-concorrenza mentre un worker processa un retry. */
export const RETRY_CLAIM_LEASE_MS = 30 * 60 * 1000;

export type RetryAppointmentSnapshot = {
  status: string | null | undefined;
  startTimeIso: string | null | undefined;
};

export type RetrySalonSnapshot = {
  isEnabled: boolean;
  reminderEnabled: boolean;
  phoneNumberId: string | null | undefined;
};

export type RetryPreconditionResult =
  | { ok: true }
  | { ok: false; reason: string; markSkipped: boolean };

/**
 * Rilettura pre-retry: niente invio se annullato, passato, orario cambiato, flag spenti.
 */
export function evaluateReminderRetryPreconditions(params: {
  reminderScheduledForIso: string;
  appointment: RetryAppointmentSnapshot;
  salon: RetrySalonSnapshot;
  now?: Date;
}): RetryPreconditionResult {
  const now = params.now ?? new Date();
  const apptStatus = String(params.appointment.status ?? "").trim().toLowerCase();

  if (apptStatus !== "scheduled") {
    return {
      ok: false,
      reason: `Appuntamento non più scheduled (stato: ${apptStatus || "—"}).`,
      markSkipped: true,
    };
  }

  if (!params.salon.isEnabled || !params.salon.reminderEnabled) {
    return {
      ok: false,
      reason: "Canale WhatsApp o reminder disattivati per il salone.",
      markSkipped: true,
    };
  }

  if (!String(params.salon.phoneNumberId ?? "").trim()) {
    return {
      ok: false,
      reason: "Phone Number ID salone mancante.",
      markSkipped: true,
    };
  }

  const startIso = params.appointment.startTimeIso;
  if (!startIso) {
    return {
      ok: false,
      reason: "Appuntamento senza start_time.",
      markSkipped: true,
    };
  }

  const startMs = Date.parse(startIso);
  const scheduledMs = Date.parse(params.reminderScheduledForIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(scheduledMs)) {
    return {
      ok: false,
      reason: "Timestamp appuntamento non valido.",
      markSkipped: true,
    };
  }

  // Orario modificato rispetto a quello del reminder originale.
  if (Math.abs(startMs - scheduledMs) > 60_000) {
    return {
      ok: false,
      reason: "Appuntamento modificato rispetto al reminder pianificato.",
      markSkipped: true,
    };
  }

  if (startMs <= now.getTime()) {
    return {
      ok: false,
      reason: "Appuntamento già trascorso: retry non inviato.",
      markSkipped: true,
    };
  }

  return { ok: true };
}
