/**
 * Parser BOSS RIC011 (Incassi per linee) da testo pdftotext -layout.
 * Righe giornaliere dd/mm/yyyy + 8 importi; ignora subtotali/totale generale.
 * Importi → centesimi esatti (segno preservato).
 */

export type BossRic011DayRow = {
  day: string; // YYYY-MM-DD
  viacard_cents: number;
  prod_altro_cents: number;
  prod_salone_cents: number;
  serv_altro_cents: number;
  serv_estetica_cents: number;
  serv_salone_cents: number;
  serv_solarium_cents: number;
  total_cents: number;
  /** Allineato a legacy_turnover_daily Roma: prod_altro→prod_salone, solarium→serv_salone. */
  folded: {
    viacard_cents: number;
    prod_salone_cents: number;
    serv_altro_cents: number;
    serv_estetica_cents: number;
    serv_salone_cents: number;
    total_cents: number;
  };
};

export type BossRic011ParseResult = {
  salonLabel: string | null;
  salonCode: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  days: BossRic011DayRow[];
  controlTotalCents: number | null;
  warnings: string[];
};

const MONEY = String.raw`(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})`;
const DAY_LINE = new RegExp(
  String.raw`^\s*(\d{2}/\d{2}/\d{4})\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s*$`,
  "gm",
);

export function italianMoneyToCents(raw: string): number {
  const s0 = String(raw).trim();
  const neg = s0.startsWith("-");
  const s = (neg ? s0.slice(1) : s0).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Importo non valido: ${raw}`);
  const cents = Math.round(n * 100);
  return neg ? -cents : cents;
}

export function dmyToIso(dmy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) throw new Error(`Data non valida: ${dmy}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function foldForLegacyTable(row: Omit<BossRic011DayRow, "folded">): BossRic011DayRow["folded"] {
  const prod = row.prod_salone_cents + row.prod_altro_cents;
  const serv = row.serv_salone_cents + row.serv_solarium_cents;
  const total =
    row.viacard_cents + prod + row.serv_altro_cents + row.serv_estetica_cents + serv;
  if (total !== row.total_cents) {
    throw new Error(`Fold mismatch ${row.day}: ${total} vs ${row.total_cents}`);
  }
  return {
    viacard_cents: row.viacard_cents,
    prod_salone_cents: prod,
    serv_altro_cents: row.serv_altro_cents,
    serv_estetica_cents: row.serv_estetica_cents,
    serv_salone_cents: serv,
    total_cents: row.total_cents,
  };
}

/**
 * Totale generale RIC011: somma delle 7 linee (= colonna Totale).
 * Se l'ultima cifra è troncata da pdftotext, usa solo la somma linee.
 */
export function parseRic011ControlTotalCents(text: string): number | null {
  const reFull = new RegExp(
    String.raw`^\s*Totale\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}`,
    "im",
  );
  const full = reFull.exec(text);
  if (full) {
    const lines = [1, 2, 3, 4, 5, 6, 7].map((i) => italianMoneyToCents(full[i]!));
    const sumLines = lines.reduce((a, b) => a + b, 0);
    const printed = italianMoneyToCents(full[8]!);
    if (printed !== sumLines) {
      // Preferisci somma linee se la colonna Totale non quadra (troncamento OCR/layout).
      return sumLines;
    }
    return printed;
  }
  const reLines = new RegExp(
    String.raw`^\s*Totale\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\s+${MONEY}\b`,
    "im",
  );
  const partial = reLines.exec(text);
  if (!partial) return null;
  return [1, 2, 3, 4, 5, 6, 7]
    .map((i) => italianMoneyToCents(partial[i]!))
    .reduce((a, b) => a + b, 0);
}

export function parseBossRic011PdfText(text: string): BossRic011ParseResult {
  const warnings: string[] = [];
  const title = text.match(/Riepilogo Incassi per Linee\s+([^\n(]+)\((\d+)\)/i);
  const salonLabel = title?.[1]?.trim() ?? null;
  const salonCode = title?.[2] ? Number(title[2]) : null;

  const period = text.match(/dal\s+(\d{2}\/\d{2}\/\d{4})\s+al\s+(\d{2}\/\d{2}\/\d{4})/i);
  const periodFrom = period ? dmyToIso(period[1]!) : null;
  const periodTo = period ? dmyToIso(period[2]!) : null;

  if (!/RIC011/i.test(text)) warnings.push("Stringa RIC011 non trovata nel testo.");

  const days: BossRic011DayRow[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(DAY_LINE)) {
    const dmy = m[1]!;
    const day = dmyToIso(dmy);
    const vals = [2, 3, 4, 5, 6, 7, 8, 9].map((i) => italianMoneyToCents(m[i]!));
    const base = {
      day,
      viacard_cents: vals[0]!,
      prod_altro_cents: vals[1]!,
      prod_salone_cents: vals[2]!,
      serv_altro_cents: vals[3]!,
      serv_estetica_cents: vals[4]!,
      serv_salone_cents: vals[5]!,
      serv_solarium_cents: vals[6]!,
      total_cents: vals[7]!,
    };
    const sumComps =
      base.viacard_cents +
      base.prod_altro_cents +
      base.prod_salone_cents +
      base.serv_altro_cents +
      base.serv_estetica_cents +
      base.serv_salone_cents +
      base.serv_solarium_cents;
    if (sumComps !== base.total_cents) {
      warnings.push(
        `Riga ${day}: somma linee ${sumComps} ≠ totale ${base.total_cents}`,
      );
      continue;
    }
    if (seen.has(day)) {
      warnings.push(`Data duplicata nel PDF: ${day}`);
      continue;
    }
    seen.add(day);
    days.push({ ...base, folded: foldForLegacyTable(base) });
  }

  days.sort((a, b) => a.day.localeCompare(b.day));
  const controlTotalCents = parseRic011ControlTotalCents(text);
  const extracted = days.reduce((s, d) => s + d.total_cents, 0);
  if (controlTotalCents != null && controlTotalCents !== extracted) {
    warnings.push(
      `Totale controllo PDF ${controlTotalCents} ≠ somma giorni ${extracted}`,
    );
  }

  return {
    salonLabel,
    salonCode,
    periodFrom,
    periodTo,
    days,
    controlTotalCents,
    warnings,
  };
}
