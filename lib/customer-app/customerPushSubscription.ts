export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const ALLOWED_PUSH_HOSTS = new Set([
  "web.push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
]);

export function parseCustomerPushSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof raw.endpoint !== "string" || raw.endpoint.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw.endpoint); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !ALLOWED_PUSH_HOSTS.has(url.hostname)) return null;
  const p256dh = raw.keys?.p256dh;
  const auth = raw.keys?.auth;
  if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{80,120}$/.test(p256dh) ||
      typeof auth !== "string" || !/^[A-Za-z0-9_-]{16,40}$/.test(auth)) return null;
  return { endpoint: url.href, keys: { p256dh, auth } };
}
