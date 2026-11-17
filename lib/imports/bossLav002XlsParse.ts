/**
 * Parsing export Boss LAV002 (Lavoranti — dettagli servizi e vendita).
 * Granularità: totale periodo per collaboratore (niente giorno/mese nel foglio).
 * Importi: Valore (€) colonna Vendita Diretta — IVA inclusa lato report Boss.
 * Lettura file .xls resta nello script di import (xlsx).
 */

export const BOSS_LAV002_SOURCE = "boss_lav002";

export type BossLav002LineKind = "SERVIZI" | "PRODOTTI" | "TOTALI";

export type BossLav002CollaboratorBlock = {
  /** Riga 0-based del nominativo nel foglio. */
  sourceRow: number;
  rawHeader: string;
  bossName: string;
  bossCode: string;
  salonLabel: string | null;
  servicesQty: number;
  servicesGross: number;
  productsQty: number;
  productsGross: number;
  /** Valore da riga "Totali collaboratore" (IVA inclusa, vendita diretta). */
  totalGross: number;
  totalQty: number;
};

export type BossLav002ParseResult = {
  sheetName: string;
  rowCount: number;
  collaborators: BossLav002CollaboratorBlock[];
  grandTotalGross: number;
  warnings: string[];
};

const SKIP_HEADERS = new Set([
  "descrizione",
  "vendita diretta",
  "scalato da abbonamento",
  "scalato da prepagata",
]);

const STRUCTURAL = new Set([
  "servizi",
  "prodotti",
  "totali",
  "totale generale per salone",
  "totali collaboratore",
]);

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function cellNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = cellStr(v).replace(/\s/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** "Nome Cognome 86" / "ENRICO VOLA  47 " → name + code (ultima token numerica). */
export function parseBossCollaboratorHeader(raw: string): {
  bossName: string;
  bossCode: string;
} | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const m = cleaned.match(/^(.*?)(?:\s+)(\d+)\s*$/);
  if (!m) return null;
  const bossName = m[1].replace(/\s+/g, " ").trim();
  const bossCode = m[2];
  if (!bossName || !bossCode) return null;
  return { bossName, bossCode };
}

function isStructuralLabel(label: string): boolean {
  const l = label.toLowerCase();
  if (STRUCTURAL.has(l)) return true;
  if (l.startsWith("totale generale per ")) return true;
  if (l.startsWith("salone:")) return true;
  return false;
}

function isCollaboratorHeader(label: string): boolean {
  if (!label) return false;
  const low = label.toLowerCase();
  if (SKIP_HEADERS.has(low)) return false;
  if (isStructuralLabel(label)) return false;
  return parseBossCollaboratorHeader(label) != null;
}

export function parseBossLav002Sheet(
  rows: unknown[][],
  sheetName: string,
): BossLav002ParseResult {
  const warnings: string[] = [];
  const collaborators: BossLav002CollaboratorBlock[] = [];

  let i = 0;
  while (i < rows.length) {
    const label = cellStr(rows[i]?.[0]);
    if (!isCollaboratorHeader(label)) {
      i += 1;
      continue;
    }

    const parsed = parseBossCollaboratorHeader(label)!;
    const sourceRow = i;
    let salonLabel: string | null = null;
    let servicesQty = 0;
    let servicesGross = 0;
    let productsQty = 0;
    let productsGross = 0;
    let totalGross = 0;
    let totalQty = 0;
    let sawCollaboratorTotal = false;

    i += 1;
    while (i < rows.length) {
      const row = rows[i] ?? [];
      const a = cellStr(row[0]);
      if (!a) {
        i += 1;
        // blank row: keep scanning within block until next header-ish content
        continue;
      }
      if (isCollaboratorHeader(a) && i > sourceRow) {
        break;
      }
      if (/^salone:/i.test(a)) {
        salonLabel = a.replace(/^salone:\s*/i, "").trim() || null;
        i += 1;
        continue;
      }
      if (/^servizi$/i.test(a)) {
        servicesQty = cellNum(row[1]);
        servicesGross = cellNum(row[3]);
        i += 1;
        continue;
      }
      if (/^prodotti$/i.test(a)) {
        productsQty = cellNum(row[1]);
        productsGross = cellNum(row[3]);
        i += 1;
        continue;
      }
      if (/^totali collaboratore$/i.test(a)) {
        totalQty = cellNum(row[1]);
        totalGross = cellNum(row[3]);
        sawCollaboratorTotal = true;
        i += 1;
        continue;
      }
      if (/^totali$/i.test(a) || /^totale generale/i.test(a)) {
        i += 1;
        continue;
      }
      i += 1;
    }

    if (!sawCollaboratorTotal) {
      warnings.push(
        `Blocco ${parsed.bossName} (${parsed.bossCode}) senza riga "Totali collaboratore" — escluso.`,
      );
      continue;
    }

    collaborators.push({
      sourceRow,
      rawHeader: label,
      bossName: parsed.bossName,
      bossCode: parsed.bossCode,
      salonLabel,
      servicesQty,
      servicesGross,
      productsQty,
      productsGross,
      totalGross,
      totalQty,
    });
  }

  const grandTotalGross = collaborators.reduce((s, c) => s + c.totalGross, 0);
  return {
    sheetName,
    rowCount: rows.length,
    collaborators,
    grandTotalGross,
    warnings,
  };
}

export function roundMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
