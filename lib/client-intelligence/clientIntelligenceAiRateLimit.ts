/**
 * Rate limit in-memory per le chiamate AI di Client Intelligence.
 * Stesso modello degli helper esistenti (customerApiRateLimit, customerClaim/rateLimit):
 * Map store per istanza, finestra temporale + gap minimo.
 *
 * Scopo: evitare chiamate OpenAI ripetute/ravvicinate per la stessa combinazione
 * utente + cliente + salone. Non protegge contro multi-istanza (Vercel): i contatori
 * non sono condivisi tra repliche.
 *
 * In caso di superamento, la route degrada al fallback deterministico
 * (buildClientInsights): nessun 429, pagina mai rotta, shape invariato.
 */

const WINDOW_MS = 60_000;
const MAX_AI_PER_WINDOW = 5;
const MIN_GAP_MS = 10_000;

type Bucket = {
  windowStart: number;
  count: number;
  lastCallAt: number;
};

const store = new Map<string, Bucket>();

/** Solo test: svuota lo store in-memory. */
export function _resetClientIntelligenceAiRateLimitStoreForTests(): void {
  store.clear();
}

export function clientIntelligenceAiRateLimitKey(
  userId: string,
  customerId: string,
  salonId: number,
): string {
  return `client-intelligence-ai:${userId}:${customerId}:${salonId}`;
}

export type ClientIntelligenceAiRateLimitCheck =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

/**
 * Verifica e consuma (atomico) un permesso per una chiamata AI.
 * Ritorna `allowed: true` e registra la chiamata, oppure `allowed: false`
 * se il gap minimo o il tetto per finestra sono superati.
 */
export function consumeClientIntelligenceAiRateLimit(
  key: string,
): ClientIntelligenceAiRateLimitCheck {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    store.set(key, { windowStart: now, count: 1, lastCallAt: now });
    return { allowed: true };
  }

  if (now - bucket.lastCallAt < MIN_GAP_MS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((MIN_GAP_MS - (now - bucket.lastCallAt)) / 1000)),
    };
  }

  if (bucket.count >= MAX_AI_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000)),
    };
  }

  bucket.count += 1;
  bucket.lastCallAt = now;
  return { allowed: true };
}
