/**
 * Rate limit leggero API App Clienti (in-memory, stesso modello di mobile login).
 * Chiave: route + IP + user id. In multi-istanza Vercel i contatori non sono condivisi.
 */

import { getClientIpFromRequest } from "@/lib/mobile/mobileLoginRateLimit";

const WINDOW_MS = 60_000;
const MAX_STAFF_PER_WINDOW = 60;
const MAX_AVAILABILITY_PER_WINDOW = 30;
const MAX_BOOKINGS_PER_WINDOW = 10;
const MAX_BOOKINGS_DELETE_PER_WINDOW = 20;

type Bucket = {
  count: number;
  windowStart: number;
};

const store = new Map<string, Bucket>();

export function _resetCustomerApiRateLimitStoreForTests(): void {
  store.clear();
}

export type CustomerApiRateLimitedRoute =
  | "staff"
  | "availability"
  | "bookings"
  | "bookings_delete";

export function customerApiRateLimitKey(
  ip: string,
  authUserId: string,
  route: CustomerApiRateLimitedRoute,
): string {
  return `customer-api:${route}:${ip}:${authUserId}`;
}

export type CustomerApiRateLimitCheck =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export function checkCustomerApiRateLimit(
  key: string,
  route: CustomerApiRateLimitedRoute,
): CustomerApiRateLimitCheck {
  const max =
    route === "availability"
      ? MAX_AVAILABILITY_PER_WINDOW
      : route === "bookings"
        ? MAX_BOOKINGS_PER_WINDOW
        : route === "bookings_delete"
          ? MAX_BOOKINGS_DELETE_PER_WINDOW
          : MAX_STAFF_PER_WINDOW;
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000));
    return { allowed: false, retryAfterSec };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function enforceCustomerApiRateLimit(
  req: Request,
  authUserId: string,
  route: CustomerApiRateLimitedRoute,
): CustomerApiRateLimitCheck {
  const ip = getClientIpFromRequest(req);
  const key = customerApiRateLimitKey(ip, authUserId, route);
  return checkCustomerApiRateLimit(key, route);
}
