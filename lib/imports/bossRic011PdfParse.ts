/**
 * Parser BOSS RIC011 (Incassi per linee) da testo pdftotext -layout.
 * Layout supportati:
 * - 6 colonne (Castrovillari): VIACARD PROD_SALONE SERV_ALTRO SERV_ESTETICA SERV_SALONE Totale
 * - 8 colonne (Cosenza): + PROD_ALTRO + SERV_SOLARIUM
 * - 9 colonne (Corigliano): + SERV_PAYBACK
 * Righe giornaliere dd/mm/yyyy + N importi; ignora subtotali/totale generale.
 * Importi → centesimi esatti (segno preservato).
 */

export type BossRic011DayRow = {
  day: string; // YYYY-MM-DD
  viacard_cents: number;
  prod_altro_cents: number;
  prod_salone_cents: number;
  serv_altro_cents: number;
  serv_estetica_cents: number;
  /** Presente solo in layout 9 colonne; 0 altrimenti. */
  serv_payback_cents: number;
  serv_salone_cents: number;
  serv_solarium_cents: number;
  total_cents: number;
  /**
   * Allineato a legacy_turnover_daily:
   * prod_altro→prod_salone; payback+solarium→serv_salone.
   */
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
  columnLayout: 6 | 8 | 9;
  days: BossRic011DayRow[];
  controlTotalCents: number | null;
  warnings: string[];
};

const MONEY = String.raw`(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})`;

function dayLineRegex(amountCount: 6 | 8 | 9): RegExp {
  const amounts = Array.from({ length: amountCount }, () => MONEY).join(String.raw`\s+`);
  return new RegExp(String.raw`^\s*(\d{2}/\d{2}/\d{4})\s+${amounts}\s*$`, "gm");
}

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
  const serv =
    row.serv_salone_cents + row.serv_solarium_cents + row.serv_payback_cents;
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

function detectColumnLayout(text: string): 6 | 8 | 9 {
  if (/SERV_PAYBAC/i.test(text) || /SERV_PAYBACK/i.test(text)) return 9;
  const nine = [...text.matchAll(dayLineRegex(9))].length;
  const eight = [...text.matchAll(dayLineRegex(8))].length;
  const six = [...text.matchAll(dayLineRegex(6))].length;
  if (nine >= eight && nine >= six && nine > 0) return 9;
  if (eight >= six && eight > 0) return 8;
  return 6;
}

/**
 * Totale generale RIC011: somma delle linee (= colonna Totale).
 * Se l'ultima cifra è troncata da pdftotext, usa solo la somma linee.
 */
export function parseRic011ControlTotalCents(
  text: string,
  lineCount: 5 | 7 | 8 = 7,
): number | null {
  const lineMoneys = Array.from({ length: lineCount }, () => MONEY).join(String.raw`\s+`);
  const reFull = new RegExp(
    String.raw`^\s*Totale\s+${lineMoneys}\s+${MONEY}`,
    "im",
  );
  const full = reFull.exec(text);
  if (full) {
    const lines = Array.from({ length: lineCount }, (_, i) =>
      italianMoneyToCents(full[i + 1]!),
    );
    const sumLines = lines.reduce((a, b) => a + b, 0);
    const printed = italianMoneyToCents(full[lineCount + 1]!);
    if (printed !== sumLines) return sumLines;
    return printed;
  }
  const reLines = new RegExp(String.raw`^\s*Totale\s+${lineMoneys}\b`, "im");
  const partial = reLines.exec(text);
  if (!partial) return null;
  return Array.from({ length: lineCount }, (_, i) => italianMoneyToCents(partial[i + 1]!)).reduce(
    (a, b) => a + b,
    0,
  );
}

function parseDayRow(
  dmy: string,
  vals: number[],
  layout: 6 | 8 | 9,
): Omit<BossRic011DayRow, "folded"> | null {
  const day = dmyToIso(dmy);
  if (layout === 6) {
    const [viacard, prodSalone, servAltro, servEstetica, servSalone, total] = vals;
    const sumComps = viacard! + prodSalone! + servAltro! + servEstetica! + servSalone!;
    if (sumComps !== total) return null;
    return {
      day,
      viacard_cents: viacard!,
      prod_altro_cents: 0,
      prod_salone_cents: prodSalone!,
      serv_altro_cents: servAltro!,
      serv_estetica_cents: servEstetica!,
      serv_payback_cents: 0,
      serv_salone_cents: servSalone!,
      serv_solarium_cents: 0,
      total_cents: total!,
    };
  }
  if (layout === 9) {
    const [
      viacard,
      prodAltro,
      prodSalone,
      servAltro,
      servEstetica,
      servPayback,
      servSalone,
      servSolarium,
      total,
    ] = vals;
    const sumComps =
      viacard! +
      prodAltro! +
      prodSalone! +
      servAltro! +
      servEstetica! +
      servPayback! +
      servSalone! +
      servSolarium!;
    if (sumComps !== total) return null;
    return {
      day,
      viacard_cents: viacard!,
      prod_altro_cents: prodAltro!,
      prod_salone_cents: prodSalone!,
      serv_altro_cents: servAltro!,
      serv_estetica_cents: servEstetica!,
      serv_payback_cents: servPayback!,
      serv_salone_cents: servSalone!,
      serv_solarium_cents: servSolarium!,
      total_cents: total!,
    };
  }
  const [
    viacard,
    prodAltro,
    prodSalone,
    servAltro,
    servEstetica,
    servSalone,
    servSolarium,
    total,
  ] = vals;
  const sumComps =
    viacard! +
    prodAltro! +
    prodSalone! +
    servAltro! +
    servEstetica! +
    servSalone! +
    servSolarium!;
  if (sumComps !== total) return null;
  return {
    day,
    viacard_cents: viacard!,
    prod_altro_cents: prodAltro!,
    prod_salone_cents: prodSalone!,
    serv_altro_cents: servAltro!,
    serv_estetica_cents: servEstetica!,
    serv_payback_cents: 0,
    serv_salone_cents: servSalone!,
    serv_solarium_cents: servSolarium!,
    total_cents: total!,
  };
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

  const columnLayout = detectColumnLayout(text);
  const dayRe = dayLineRegex(columnLayout);
  const amountCount = columnLayout;

  const days: BossRic011DayRow[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(dayRe)) {
    const dmy = m[1]!;
    const vals = Array.from({ length: amountCount }, (_, i) =>
      italianMoneyToCents(m[i + 2]!),
    );
    const base = parseDayRow(dmy, vals, columnLayout);
    if (!base) {
      warnings.push(`Riga ${dmy}: somma linee ≠ totale — esclusa.`);
      continue;
    }
    if (seen.has(base.day)) {
      warnings.push(`Data duplicata nel PDF: ${base.day}`);
      continue;
    }
    seen.add(base.day);
    days.push({ ...base, folded: foldForLegacyTable(base) });
  }

  days.sort((a, b) => a.day.localeCompare(b.day));
  const lineCount = columnLayout === 9 ? 8 : columnLayout === 8 ? 7 : 5;
  const controlTotalCents = parseRic011ControlTotalCents(text, lineCount);
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
    columnLayout,
    days,
    controlTotalCents,
    warnings,
  };
}
