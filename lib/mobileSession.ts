import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getMobileJwtSecret, requireMobileJwtSecret } from "@/lib/mobile/mobileJwtSecret";
import { mergeStaffSalonIds } from "@/lib/mobile/mobileStaffSalons";

/**
 * Contratto mobile Team (hardening Fase 0):
 * - Login: POST /api/mobile/login emette sempre `access_token` (Bearer); MOBILE_JWT_SECRET obbligatorio.
 * - JWT: sid, salon_id (primario), salon_ids[] (primario + staff_salons), exp.
 * - Route protette: Authorization Bearer; nessun fallback body-only per identità.
 */
/** 30 giorni — allineato a sessioni mobile tipiche. */
export const MOBILE_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

const JWT_ALG = "HS256";

export type VerifiedMobileToken = {
  sid: number;
  salon_id: number;
  salon_ids: number[];
};

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

export function normalizeMobileSalonIds(
  primarySalonId: number,
  salonIds?: number[] | null,
): number[] {
  if (salonIds?.length) {
    return mergeStaffSalonIds(primarySalonId, salonIds);
  }
  return mergeStaffSalonIds(primarySalonId, []);
}

export function signMobileToken(params: {
  sid: number;
  salon_id: number;
  salon_ids: number[];
}): string {
  const secret = requireMobileJwtSecret();
  const salon_id = Number(params.salon_id);
  const sid = Number(params.sid);
  if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(salon_id) || salon_id <= 0) {
    throw new Error("Invalid mobile token params");
  }
  const salon_ids = normalizeMobileSalonIds(salon_id, params.salon_ids);

  const exp = Math.floor(Date.now() / 1000) + MOBILE_TOKEN_TTL_SEC;
  const header = base64UrlEncode(JSON.stringify({ alg: JWT_ALG, typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sid,
      salon_id,
      salon_ids,
      exp,
    }),
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

function parseSalonIdsFromPayload(
  raw: unknown,
  fallbackPrimary: number,
): number[] {
  if (Array.isArray(raw)) {
    const ids = raw
      .map((x) => Number(x))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length) {
      return normalizeMobileSalonIds(fallbackPrimary, ids);
    }
  }
  return normalizeMobileSalonIds(fallbackPrimary, []);
}

export function verifyMobileToken(
  token: string,
): { ok: true } & VerifiedMobileToken | { ok: false; reason: string } {
  const secret = getMobileJwtSecret();
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
  let payload: { sid?: unknown; salon_id?: unknown; salon_ids?: unknown; exp?: unknown };
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
  const salon_ids = parseSalonIdsFromPayload(payload.salon_ids, salon_id);
  return { ok: true, sid, salon_id, salon_ids };
}

export function isSalonAllowedInMobileToken(salonId: number, token: VerifiedMobileToken): boolean {
  return token.salon_ids.includes(salonId);
}

export function resolveMobileSalonIdFromBody(
  bodySalonId: unknown,
  token: VerifiedMobileToken,
): number | null {
  if (bodySalonId === undefined || bodySalonId === null) {
    return token.salon_id;
  }
  const n = Number(bodySalonId);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }
  if (!isSalonAllowedInMobileToken(n, token)) {
    return null;
  }
  return n;
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export type ResolveMobileStaffIdResult =
  | { ok: true; staffId: number; token: VerifiedMobileToken }
  | { ok: false; response: NextResponse };

/**
 * Identità mobile: `Authorization: Bearer` (JWT firmato da login).
 * Nessun fallback legacy via `body.staff_id`.
 */
export function resolveMobileStaffId(
  req: Request,
  body: { staff_id?: number },
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
    return { ok: true, staffId: v.sid, token: v };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

export function verifyMobileBearerFromRequest(
  req: Request,
): { ok: true; token: VerifiedMobileToken } | { ok: false; response: NextResponse } {
  const bearer = getBearerToken(req);
  if (!bearer) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const v = verifyMobileToken(bearer);
  if (!v.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, token: v };
}
