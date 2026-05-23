/** Rifiuta timbrature con accuratezza GPS peggiore di questa soglia (metri). */
export const GPS_MAX_ACCURACY_M = 100;

export type ParsedClockBody = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  isMocked: boolean;
  deviceId: string | null;
  appVersion: string | null;
  salonId: number | null;
};

export type ParseClockBodyResult =
  | { ok: true; body: ParsedClockBody }
  | { ok: false; error: string; status: number };

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function readBool(v: unknown): boolean {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  return false;
}

function readOptionalText(v: unknown, maxLen: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function parseClockRequestBody(raw: unknown): ParseClockBodyResult {
  const o = asRecord(raw);
  if (!o) {
    return { ok: false, error: "Invalid request body", status: 400 };
  }

  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Invalid request body", status: 400 };
  }

  let accuracyM: number | null = null;
  if (o.accuracy !== undefined && o.accuracy !== null) {
    const acc = Number(o.accuracy);
    if (!Number.isFinite(acc) || acc < 0) {
      return { ok: false, error: "Invalid GPS accuracy", status: 400 };
    }
    accuracyM = acc;
  }

  const isMocked = readBool(o.isMocked ?? o.is_mocked);

  let salonId: number | null = null;
  if (o.salon_id !== undefined && o.salon_id !== null) {
    const sid = Number(o.salon_id);
    if (!Number.isInteger(sid) || sid <= 0) {
      return { ok: false, error: "Invalid salon_id", status: 400 };
    }
    salonId = sid;
  }

  return {
    ok: true,
    body: {
      lat,
      lng,
      accuracyM,
      isMocked,
      deviceId: readOptionalText(o.device_id ?? o.deviceId, 128),
      appVersion: readOptionalText(o.app_version ?? o.appVersion, 64),
      salonId,
    },
  };
}

export function rejectMockedLocation(isMocked: boolean): { reject: true; error: string } | { reject: false } {
  if (isMocked) {
    return { reject: true, error: "Posizione simulata non consentita per la timbratura" };
  }
  return { reject: false };
}

export function rejectPoorGpsAccuracy(
  accuracyM: number | null,
  maxMeters: number = GPS_MAX_ACCURACY_M,
): { reject: true; error: string } | { reject: false } {
  if (accuracyM == null) {
    return { reject: false };
  }
  if (accuracyM > maxMeters) {
    return {
      reject: true,
      error: `Segnale GPS troppo impreciso (>${maxMeters} m). Avvicinati e riprova.`,
    };
  }
  return { reject: false };
}

/**
 * @deprecated Timbratura clock usa detectClockSalonFromGps (ignora salon_id client).
 * Mantenuto per compat test legacy; non usare in app/api/mobile/attendance/clock.
 */
export function resolveClockSalonId(
  requestedSalonId: number | null,
  token: { salon_id: number; salon_ids: number[] },
): number | null {
  const effective = requestedSalonId ?? token.salon_id;
  if (!Number.isInteger(effective) || effective <= 0) {
    return null;
  }
  if (!token.salon_ids.includes(effective)) {
    return null;
  }
  return effective;
}
