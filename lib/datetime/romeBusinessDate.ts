/**
 * Giorno operativo Europe/Rome per timestamp scritti come UTC wall clock
 * (`timestamp without time zone` da `now()` con TimeZone=UTC, o ISO senza offset).
 *
 * Non muta i valori storici: solo raggruppamento/filtro in lettura.
 */

const ROME = "Europe/Rome";
const HAS_TZ_RE = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;

/** Interpreta stringa DB/ISO come istante (naive → UTC). */
export function parseUtcWallInstant(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let normalized = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
  const tzMatch = normalized.match(HAS_TZ_RE);
  if (!tzMatch) {
    normalized = `${normalized}Z`;
  } else if (tzMatch[1] && /^[+-]\d{2}$/.test(tzMatch[1])) {
    normalized = `${normalized}:00`;
  }
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD del calendario Europe/Rome per un istante. */
export function romeBusinessDateFromInstant(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Giorno operativo Rome da `sales.date` / `opened_at` naive-UTC. */
export function romeBusinessDateFromUtcWall(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const d = parseUtcWallInstant(String(raw));
  if (!d) return null;
  return romeBusinessDateFromInstant(d);
}

/**
 * Bounds inclusivi come timestamp UTC wall (stesso encoding di `sales.date` / `now()`)
 * che coprono l'intero giorno operativo Rome `ymd` (YYYY-MM-DD).
 *
 * Equivalente SQL:
 *   lower = (ymd::timestamp AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'UTC'
 *   upper = ((ymd+1)::timestamp AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'UTC'  -- exclusive
 */
export function utcWallBoundsForRomeBusinessDate(ymd: string): {
  startUtcWall: string;
  endUtcWallExclusive: string;
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`utcWallBoundsForRomeBusinessDate: invalid ymd ${ymd}`);
  }
  const startUtc = romeLocalMidnightToUtcMs(ymd);
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const nextYmd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const endUtc = romeLocalMidnightToUtcMs(nextYmd);

  return {
    startUtcWall: toUtcWallTimestamp(startUtc),
    endUtcWallExclusive: toUtcWallTimestamp(endUtc),
  };
}

function toUtcWallTimestamp(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const ms3 = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${y}-${mo}-${day}T${hh}:${mm}:${ss}.${ms3}`;
}

/**
 * Mezzanotte Europe/Rome di `ymd` come epoch ms UTC.
 * Usa iterazione sull'offset (gestisce CET/CEST e i giorni di cambio ora).
 */
export function romeLocalMidnightToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  // Prima stima: ymd 00:00 come se fosse UTC, poi correggi con offset Rome reale.
  let guess = Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const offsetMin = romeOffsetMinutesAt(guess);
    const asRomeWall = Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0);
    guess = asRomeWall - offsetMin * 60_000;
  }
  return guess;
}

function romeOffsetMinutesAt(utcMs: number): number {
  const d = new Date(utcMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // GMT+1 / GMT+2 / UTC+1 …
  const m = tz.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2] ?? 0);
  const mm = Number(m[3] ?? 0);
  return sign * (hh * 60 + mm);
}

/** True se `sales.date` (UTC wall) cade nel giorno operativo Rome `ymd`. */
export function utcWallInstantOnRomeBusinessDate(
  utcWall: string,
  ymd: string,
): boolean {
  const day = romeBusinessDateFromUtcWall(utcWall);
  return day === ymd;
}
