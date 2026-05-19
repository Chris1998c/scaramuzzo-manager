/**
 * Parser e normalizzazione condivisi per export CSV clienti Boss (;).
 */

export const FAKE_BIRTH_PATTERNS = new Set(["01/01/1900", "1/1/1900"]);

export type SessoBucket = "M" | "F" | "vuoto" | "altro";

export type BossCsvColumnIndices = {
  nominativo: number;
  cellulare: number;
  telefono: number;
  email: number;
  sesso: number;
  valido: number;
  dataNascita: number;
  descrizione: number;
};

export function parseCsvSemicolon(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ";") {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (ch === "\r") i++;
      continue;
    }

    if (ch === "\r") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function normalizeHeaderName(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findColumnIndex(headers: string[], ...names: string[]): number {
  const normalized = headers.map(normalizeHeaderName);
  for (const name of names) {
    const idx = normalized.indexOf(normalizeHeaderName(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function resolveBossCsvColumns(headers: string[]): BossCsvColumnIndices {
  return {
    nominativo: findColumnIndex(headers, "nominativo"),
    cellulare: findColumnIndex(headers, "cellulare"),
    telefono: findColumnIndex(headers, "telefono"),
    email: findColumnIndex(headers, "email"),
    sesso: findColumnIndex(headers, "sesso"),
    valido: findColumnIndex(headers, "valido"),
    dataNascita: findColumnIndex(headers, "data di nascita", "data nascita"),
    descrizione: findColumnIndex(headers, "descrizione"),
  };
}

export function getField(row: string[], index: number): string {
  if (index < 0 || index >= row.length) return "";
  return row[index]?.trim() ?? "";
}

export function rowToRawObject(headers: string[], row: string[]): Record<string, string> {
  const seen = new Map<string, number>();
  const raw: Record<string, string> = {};
  headers.forEach((header, i) => {
    const base = header.trim() || `col_${i}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const key = n === 1 ? base : `${base}_${n}`;
    raw[key] = row[i] ?? "";
  });
  return raw;
}

export function normalizeNominativo(raw: string): { display: string; key: string } {
  const display = raw.trim().replace(/\s+/g, " ");
  const key = display.toUpperCase();
  return { display, key };
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hadPlus39 =
    /\+39\b/i.test(trimmed) || /^0039/.test(trimmed.replace(/\s/g, ""));
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hadPlus39) {
    const local = digits.startsWith("39") ? digits.slice(2) : digits;
    return local ? `+39${local}` : null;
  }

  return digits;
}

export function parseItalianDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

export function formatDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isFakeBirthDate(raw: string): boolean {
  const compact = raw.trim().replace(/\s+/g, "");
  if (FAKE_BIRTH_PATTERNS.has(compact)) return true;
  const normalized = compact
    .replace(/^0(\d)\//, "$1/")
    .replace(/\/0(\d)\//, "/$1/");
  return FAKE_BIRTH_PATTERNS.has(normalized);
}

export function parseValido(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "true" || v === "1" || v === "si" || v === "sì" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

export function classifySesso(raw: string): SessoBucket {
  const s = raw.trim().toUpperCase();
  if (!s) return "vuoto";
  if (s === "M" || s === "MASCHIO") return "M";
  if (s === "F" || s === "FEMMINA") return "F";
  return "altro";
}

export function normalizeSex(raw: string): { raw: string | null; normalized: string | null } {
  const sexRaw = raw.trim() || null;
  if (!sexRaw) return { raw: null, normalized: null };
  const bucket = classifySesso(raw);
  if (bucket === "M" || bucket === "F") return { raw: sexRaw, normalized: bucket };
  return { raw: sexRaw, normalized: null };
}

export function guessNameFromNominativo(nominativo: string): {
  first: string | null;
  last: string | null;
} {
  const t = nominativo.trim().replace(/\s+/g, " ");
  if (!t) return { first: null, last: null };
  const parts = t.split(" ");
  if (parts.length === 1) return { first: null, last: parts[0] };
  return { first: parts.slice(1).join(" "), last: parts[0] };
}
