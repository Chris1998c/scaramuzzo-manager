// lib/customerClaim/rateLimit.ts
// Limite in-memory per istanza (serverless: mitigazione parziale; la tabella challenge limita anche per intervallo).

type Bucket = { windowStart: number; count: number };

const WINDOW_MS = 60 * 60_000; // 1h
const MAX_PER_WINDOW = 8;
const MIN_GAP_MS = 45_000; // tra due request-otp per lo stesso utente

const buckets = new Map<string, Bucket>();
const lastRequest = new Map<string, number>();

function keyUser(userId: string) {
  return `u:${userId}`;
}

export function canRequestOtp(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const k = keyUser(userId);
  const now = Date.now();
  const last = lastRequest.get(k) ?? 0;
  if (now - last < MIN_GAP_MS) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((MIN_GAP_MS - (now - last)) / 1000),
    };
  }

  let b = buckets.get(k);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { windowStart: now, count: 0 };
    buckets.set(k, b);
  }
  if (b.count >= MAX_PER_WINDOW) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  return { ok: true };
}

export function recordRequestOtp(userId: string) {
  const k = keyUser(userId);
  const now = Date.now();
  lastRequest.set(k, now);
  let b = buckets.get(k);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { windowStart: now, count: 0 };
    buckets.set(k, b);
  }
  b.count += 1;
}
