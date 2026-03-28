import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Contratto mobile Team (hardening):
 * - Login: POST /api/mobile/login emette `access_token` (Bearer) se `MOBILE_JWT_SECRET` è impostato.
 * - Route protette: inviare `Authorization: Bearer <access_token>`; l’identità è nel token (sid/salon_id/exp).
 * - MOBILE_AUTH_STRICT assente/false: senza Bearer si può ancora usare `body.staff_id` (compat) — log [mobile-auth][compat].
 * - MOBILE_AUTH_STRICT=true: Bearer obbligatorio sulle route che usano resolveMobileStaffId; nessun fallback body-only.
 * - Bearer presente ma invalido/scaduto: 401, nessun fallback al body.
 */
/** 30 giorni — allineato a sessioni mobile tipiche. */
export const MOBILE_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

function isMobileAuthStrict(): boolean {
  const v = process.env.MOBILE_AUTH_STRICT?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function requestRouteLabel(req: Request): string {
  try {
    const u = new URL(req.url);
    return `${req.method} ${u.pathname}`;
  } catch {
    return `${req.method} (path unknown)`;
  }
}

const JWT_ALG = "HS256";

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecodeToString(s: string): string {
  let pad = s.replace(/-/g, "+").replace(/_/g, "/");
  while (pad.length % 4) pad += "=";
  return Buffer.from(pad, "base64").toString("utf8");
}

/**
 * Giorno calendario Europe/Rome da una ISO timestamp (per KPI presenze).
 */
export function romeDayKeyFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function signMobileToken(params: { sid: number; salon_id: number }): string {
  const secret = process.env.MOBILE_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("MOBILE_JWT_SECRET is not set");
  }
  const exp = Math.floor(Date.now() / 1000) + MOBILE_TOKEN_TTL_SEC;
  const header = base64UrlEncode(JSON.stringify({ alg: JWT_ALG, typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sid: params.sid,
      salon_id: params.salon_id,
      exp,
    })
  );
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}

export function verifyMobileToken(
  token: string
): { ok: true; sid: number; salon_id: number } | { ok: false; reason: string } {
  const secret = process.env.MOBILE_JWT_SECRET?.trim();
  if (!secret) {
    return { ok: false, reason: "server_misconfigured" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "invalid_token" };
  }
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = createHmac("sha256", secret).update(data).digest();
  let sigBuf: Buffer;
  try {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/");
    let b64 = pad;
    while (b64.length % 4) b64 += "=";
    sigBuf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, reason: "invalid_token" };
  }
  if (expected.length !== sigBuf.length || !timingSafeEqual(expected, sigBuf)) {
    return { ok: false, reason: "invalid_signature" };
  }
  let payload: { sid?: unknown; salon_id?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(base64UrlDecodeToString(p));
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  const sid = Number(payload.sid);
  const salon_id = Number(payload.salon_id);
  const exp = Number(payload.exp);
  if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(salon_id) || salon_id <= 0) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, sid, salon_id };
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export type ResolveMobileStaffIdResult =
  | { ok: true; staffId: number }
  | { ok: false; response: NextResponse };

/**
 * Identità mobile: preferisce `Authorization: Bearer` (JWT firmato da login).
 * Fallback legacy: `body.staff_id` se manca il token (solo se MOBILE_AUTH_STRICT non è attivo).
 */
export function resolveMobileStaffId(
  req: Request,
  body: { staff_id?: number }
): ResolveMobileStaffIdResult {
  const bearer = getBearerToken(req);
  if (bearer) {
    const v = verifyMobileToken(bearer);
    if (!v.ok) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    const bodyStaff = body.staff_id !== undefined ? Number(body.staff_id) : NaN;
    if (Number.isInteger(bodyStaff) && bodyStaff > 0 && bodyStaff !== v.sid) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, staffId: v.sid };
  }

  if (isMobileAuthStrict()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const staffId = Number(body.staff_id);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid request body" }, { status: 400 }),
    };
  }

  console.warn(
    "[mobile-auth][compat]",
    requestRouteLabel(req),
    "using body staff_id fallback"
  );
  return { ok: true, staffId };
}
