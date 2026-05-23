/**
 * Rate limit login mobile (staff_code + PIN).
 *
 * Implementazione in-memory: ok per dev e istanza singola.
 * In produzione multi-istanza (Vercel) usare store condiviso (Upstash Redis, Vercel KV, Supabase)
 * con la stessa chiave `ip:staff_code` — altrimenti ogni replica ha contatori separati.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const BLOCK_MS = 15 * 60 * 1000;

type Bucket = {
  failures: number;
  firstAt: number;
  blockedUntil?: number;
};

const store = new Map<string, Bucket>();

/** Solo test: svuota lo store in-memory. */
export function _resetMobileLoginRateLimitStoreForTests(): void {
  store.clear();
}

export function getClientIpFromRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function mobileLoginRateLimitKey(ip: string, staffCode: string): string {
  return `${ip}:${String(staffCode).trim().toLowerCase()}`;
}

export type MobileLoginRateLimitCheck =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export function checkMobileLoginRateLimit(key: string): MobileLoginRateLimitCheck {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket) {
    return { allowed: true };
  }

  if (bucket.blockedUntil != null && now < bucket.blockedUntil) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)),
    };
  }

  if (now - bucket.firstAt > WINDOW_MS) {
    store.delete(key);
    return { allowed: true };
  }

  if (bucket.failures >= MAX_FAILURES) {
    bucket.blockedUntil = now + BLOCK_MS;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(BLOCK_MS / 1000)),
    };
  }

  return { allowed: true };
}

export function recordMobileLoginFailure(key: string): void {
  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    bucket = { failures: 1, firstAt: now };
    store.set(key, bucket);
    return;
  }

  bucket.failures += 1;
  if (bucket.failures >= MAX_FAILURES) {
    bucket.blockedUntil = now + BLOCK_MS;
  }
}

export function resetMobileLoginRateLimit(key: string): void {
  store.delete(key);
}
