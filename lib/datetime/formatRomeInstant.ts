/**
 * Formattazione istanti in Europe/Rome.
 *
 * - Con offset/`Z` → istante assoluto.
 * - Senza fuso (tipico: `timestamptz` PostgREST senza offset, o
 *   `timestamp without time zone` scritto da `toISOString()`) → interpreta come UTC.
 * Non usare per orari agenda (wall clock Rome già in DB) né per orari Epson
 * (`fiscal_receipt_*` / `receipt_iso_datetime`).
 */

const ROME = "Europe/Rome";

/** Z, ±HH:MM, ±HHMM, o ±HH (es. Postgres `+00`). */
const HAS_TZ_RE = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;

export function parseInstantUtcAware(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  let normalized = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;

  const tzMatch = normalized.match(HAS_TZ_RE);
  if (!tzMatch) {
    normalized = `${normalized}Z`;
  } else if (tzMatch[1] && /^[+-]\d{2}$/.test(tzMatch[1])) {
    // `+00` → `+00:00` (Date non sempre accetta offset a 2 sole cifre)
    normalized = `${normalized}:00`;
  }

  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatParts(
  d: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone: ROME, ...options }).format(d);
}

/** HH:mm in Europe/Rome (es. Stato cassa). */
export function formatRomeTimeHHmm(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const d = parseInstantUtcAware(String(raw));
  if (!d) return "—";
  return formatParts(d, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Data/ora locale Italy in Europe/Rome (es. Job fiscali). */
export function formatRomeDateTime(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const d = parseInstantUtcAware(String(raw));
  if (!d) return String(raw);
  return formatParts(d, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
