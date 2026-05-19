/**
 * Dry-run audit for Boss product XLS exports per salone (no DB import).
 * Usage: npm run audit:boss-products
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import XLSX from "xlsx";

const REPO_ROOT = process.cwd();
const INPUT_DIR = join(REPO_ROOT, "data/imports/products-boss");
const REPORT_PATH = join(INPUT_DIR, "products-boss-audit-report.json");

const MAX_PREVIEW_PER_FILE = 20;
const MAX_DUPLICATE_EXAMPLES = 50;
const MAX_SIMILAR_EXAMPLES = 50;
const MAX_CROSS_SALON_TOP = 50;
const CONSOLE_PREVIEW = 5;

type ExportFormat = "statistics" | "inventory" | "unknown";

type ColumnCandidates = {
  name: number | null;
  qty: number | null;
  price: number | null;
  cost: number | null;
  category: number | null;
  supplier: number | null;
  barcode: number | null;
  saleValue: number | null;
};

type ParsedRow = {
  rowIndex: number;
  raw: Record<string, string | number | null>;
  name: string;
  nameKey: string;
  nameKeySoft: string;
  qty: number | null;
  qtyRaw: string;
  price: number | null;
  priceRaw: string;
  cost: number | null;
  costRaw: string;
  category: string;
  barcode: string;
  isLikelyCategoryHeader: boolean;
};

type SalonId =
  | "Roma"
  | "Corigliano"
  | "Castrovillari"
  | "Cosenza"
  | "Magazzino-Centrale"
  | "unknown";

type DuplicateExample = {
  key: string;
  count: number;
  sampleNames: string[];
};

type CrossSalonMatch = {
  normalizedKey: string;
  salons: string[];
  totalRecords: number;
  sampleNamesBySalon: Record<string, string[]>;
};

function salonFromFilename(fileName: string): SalonId {
  const base = basename(fileName, ".xls").replace(/^Prodotti\s+/i, "").trim();
  const known: SalonId[] = [
    "Roma",
    "Corigliano",
    "Castrovillari",
    "Cosenza",
    "Magazzino-Centrale",
  ];
  return (known.find((s) => s.toLowerCase() === base.toLowerCase()) ??
    "unknown") as SalonId;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Normalizzazione base per confronto nomi. */
function normalizeProductName(raw: string): string {
  return normalizeSpaces(
    raw
      .toLowerCase()
      .replace(/[.,;:'"()[\]/\\!?]+/g, " ")
      .replace(/\s+/g, " "),
  );
}

/** Variante soft: rimuove unità di misura isolate (non troppo aggressiva). */
function normalizeProductNameSoft(raw: string): string {
  let key = normalizeProductName(raw);
  key = key
    .replace(/\b\d+\s*(ml|lt|l|gr|g|kg|cl|pz|pcs)\b/gi, " ")
    .replace(/\b(ml|lt|l|gr|g|kg|cl|pz|pcs)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key;
}

function parseNumeric(value: unknown): { valid: boolean; num: number | null; raw: string } {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { valid: true, num: value, raw: String(value) };
  }
  const raw = cellToString(value);
  if (!raw) return { valid: false, num: null, raw: "" };
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { valid: false, num: null, raw };
  }
  const num = Number(normalized);
  if (!Number.isFinite(num)) return { valid: false, num: null, raw };
  return { valid: true, num, raw };
}

function headerScore(header: string, patterns: RegExp[]): number {
  const h = header.toLowerCase();
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(h)) return patterns.length - i;
  }
  return 0;
}

function detectColumns(headers: string[]): { format: ExportFormat; candidates: ColumnCandidates } {
  const scored = headers.map((h, index) => ({ header: h, index }));

  const pickBest = (patterns: RegExp[]): number | null => {
    let best: { index: number; score: number } | null = null;
    for (const { header, index } of scored) {
      const score = headerScore(header, patterns);
      if (score > 0 && (!best || score > best.score)) {
        best = { index, score };
      }
    }
    return best?.index ?? null;
  };

  const name = pickBest([/^descrizione$/i, /descriz/i, /nome/i, /prodotto/i]);
  const qty = pickBest([/^giacenza$/i, /^qt[aà]$/i, /quantit/i, /giacenz/i]);
  const price = pickBest([/^prezzo/i, /prezzo.*€/i, /vendita/i]);
  const cost = pickBest([/costo unitario/i, /^costo/i, /costo medio/i]);
  const category = pickBest([/^categoria$/i, /categoria/i, /reparto/i]);
  const supplier = pickBest([/fornitore/i, /^marca$/i]);
  const barcode = pickBest([/codice a barre/i, /barcode/i, /^ean$/i, /^codice$/i]);
  const saleValue = pickBest([/^val\s*\(/i, /valore vendita/i]);

  const hasStats =
    qty !== null &&
    saleValue !== null &&
    headers.some((h) => /% qt/i.test(h));
  const hasInventory =
    price !== null &&
    qty !== null &&
    category !== null &&
    headers.some((h) => /costo unitario/i.test(h));

  let format: ExportFormat = "unknown";
  if (hasInventory) format = "inventory";
  else if (hasStats) format = "statistics";

  return {
    format,
    candidates: { name, qty, price, cost, category, supplier, barcode, saleValue },
  };
}

function getCell(row: unknown[], index: number | null): unknown {
  if (index === null || index < 0) return "";
  return Array.isArray(row) ? row[index] : "";
}

function buildParsedRows(
  dataRows: unknown[][],
  cols: ColumnCandidates,
  format: ExportFormat,
): ParsedRow[] {
  const parsed: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!Array.isArray(row) || !row.some((c) => cellToString(c) !== "")) continue;

    const name = normalizeSpaces(cellToString(getCell(row, cols.name)));
    const qtyParsed = parseNumeric(getCell(row, cols.qty));
    const priceParsed = parseNumeric(getCell(row, cols.price));
    const costParsed = parseNumeric(getCell(row, cols.cost));
    const category = cellToString(getCell(row, cols.category));
    const barcode = cellToString(getCell(row, cols.barcode));
    const saleValueParsed = parseNumeric(getCell(row, cols.saleValue));

    const isLikelyCategoryHeader =
      format === "statistics" &&
      name.length > 0 &&
      !qtyParsed.valid &&
      qtyParsed.raw === "" &&
      !barcode &&
      name === name.toUpperCase() &&
      name.length < 80;

    const raw: Record<string, string | number | null> = {
      descrizione: name || null,
      qty: qtyParsed.num,
      prezzo: priceParsed.num,
      costo: costParsed.num,
      categoria: category || null,
      barcode: barcode || null,
      valVendita: saleValueParsed.num,
    };

    parsed.push({
      rowIndex: i + 2,
      raw,
      name,
      nameKey: normalizeProductName(name),
      nameKeySoft: normalizeProductNameSoft(name),
      qty: qtyParsed.num,
      qtyRaw: qtyParsed.raw,
      price: priceParsed.num,
      priceRaw: priceParsed.raw,
      cost: costParsed.num,
      costRaw: costParsed.raw,
      category,
      barcode,
      isLikelyCategoryHeader,
    });
  }

  return parsed;
}

function topDuplicates(
  counts: Map<string, number>,
  namesByKey: Map<string, Set<string>>,
  limit: number,
): DuplicateExample[] {
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({
      key,
      count,
      sampleNames: [...(namesByKey.get(key) ?? [])].slice(0, 5),
    }));
}

function previewRow(row: ParsedRow): Record<string, unknown> {
  return {
    row: row.rowIndex,
    descrizione: row.name.slice(0, 120),
    qty: row.qty,
    prezzo: row.price,
    costo: row.cost,
    categoria: row.category || null,
    barcode: row.barcode || null,
    categoryHeader: row.isLikelyCategoryHeader,
  };
}

function auditFile(filePath: string, fileName: string) {
  const salon = salonFromFilename(fileName);
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const perSheet: {
    sheetName: string;
    rowCount: number;
    dataRowCount: number;
    headers: string[];
    format: ExportFormat;
    columnCandidates: ColumnCandidates;
    productRows: ParsedRow[];
  }[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    if (matrix.length === 0) continue;

    const headers = (matrix[0] ?? []).map((c) => cellToString(c));
    const dataRows = matrix.slice(1);
    const { format, candidates } = detectColumns(headers);
    const productRows = buildParsedRows(dataRows, candidates, format);

    perSheet.push({
      sheetName,
      rowCount: matrix.length,
      dataRowCount: dataRows.length,
      headers,
      format,
      columnCandidates: candidates,
      productRows,
    });
  }

  const allRows = perSheet.flatMap((s) => s.productRows);
  const productOnly = allRows.filter((r) => !r.isLikelyCategoryHeader && r.name);

  let emptyName = 0;
  let emptyQty = 0;
  let invalidQty = 0;
  let emptyPrice = 0;
  let invalidPrice = 0;
  let emptyCost = 0;
  let invalidCost = 0;

  const nameCounts = new Map<string, number>();
  const namesByKey = new Map<string, Set<string>>();

  for (const row of allRows) {
    if (!row.name) emptyName++;
    if (!row.isLikelyCategoryHeader) {
      if (!row.qtyRaw && row.qty === null) emptyQty++;
      else if (row.qtyRaw && row.qty === null) invalidQty++;

      if (!row.priceRaw && row.price === null) emptyPrice++;
      else if (row.priceRaw && row.price === null) invalidPrice++;

      if (!row.costRaw && row.cost === null) emptyCost++;
      else if (row.costRaw && row.cost === null) invalidCost++;
    }

    if (row.nameKey) {
      nameCounts.set(row.nameKey, (nameCounts.get(row.nameKey) ?? 0) + 1);
      if (!namesByKey.has(row.nameKey)) namesByKey.set(row.nameKey, new Set());
      namesByKey.get(row.nameKey)!.add(row.name);
    }
  }

  const withinSalonDuplicates = topDuplicates(nameCounts, namesByKey, MAX_DUPLICATE_EXAMPLES);

  return {
    fileName,
    salon,
    sheets: perSheet.map((s) => ({
      sheetName: s.sheetName,
      totalRowsIncludingHeader: s.rowCount,
      dataRows: s.dataRowCount,
      headers: s.headers,
      exportFormat: s.format,
      columnCandidates: s.columnCandidates,
    })),
    totals: {
      allParsedRows: allRows.length,
      likelyCategoryHeaders: allRows.filter((r) => r.isLikelyCategoryHeader).length,
      productLikeRows: productOnly.length,
    },
    quality: {
      emptyName,
      emptyQty,
      invalidQty,
      emptyPrice,
      invalidPrice,
      emptyCost,
      invalidCost,
      withBarcode: productOnly.filter((r) => r.barcode).length,
    },
    duplicatesWithinSalon: {
      duplicateKeys: withinSalonDuplicates.length,
      topExamples: withinSalonDuplicates,
    },
    preview: allRows
      .filter((r) => r.name)
      .slice(0, MAX_PREVIEW_PER_FILE)
      .map(previewRow),
    /** Righe indicizzate per analisi cross-salone (solo prodotti). */
    products: productOnly,
  };
}

function runAudit(): void {
  let files: string[];
  try {
    files = readdirSync(INPUT_DIR)
      .filter((f) => f.toLowerCase().endsWith(".xls") || f.toLowerCase().endsWith(".xlsx"))
      .sort();
  } catch {
    console.error(`Directory non trovata: ${INPUT_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(`Nessun file .xls in ${INPUT_DIR}`);
    process.exit(1);
  }

  const fileAudits = files.map((f) => auditFile(join(INPUT_DIR, f), f));

  const bySalonKey = new Map<
    string,
    { salon: string; nameKey: string; nameKeySoft: string; name: string }[]
  >();

  for (const audit of fileAudits) {
    for (const row of audit.products) {
      if (!row.nameKey) continue;
      if (!bySalonKey.has(row.nameKey)) bySalonKey.set(row.nameKey, []);
      bySalonKey.get(row.nameKey)!.push({
        salon: audit.salon,
        nameKey: row.nameKey,
        nameKeySoft: row.nameKeySoft,
        name: row.name,
      });
    }
  }

  const exactCrossSalon: CrossSalonMatch[] = [];
  for (const [key, entries] of bySalonKey.entries()) {
    const salons = [...new Set(entries.map((e) => e.salon))];
    if (salons.length < 2) continue;
    const namesBySalon: Record<string, string[]> = {};
    for (const e of entries) {
      if (!namesBySalon[e.salon]) namesBySalon[e.salon] = [];
      if (!namesBySalon[e.salon].includes(e.name)) {
        namesBySalon[e.salon].push(e.name);
      }
    }
    exactCrossSalon.push({
      normalizedKey: key,
      salons,
      totalRecords: entries.length,
      sampleNamesBySalon: Object.fromEntries(
        Object.entries(namesBySalon).map(([s, names]) => [s, names.slice(0, 3)]),
      ),
    });
  }
  exactCrossSalon.sort((a, b) => b.totalRecords - a.totalRecords);

  const softGroups = new Map<string, Map<string, Set<string>>>();
  for (const audit of fileAudits) {
    for (const row of audit.products) {
      if (!row.nameKeySoft) continue;
      if (!softGroups.has(row.nameKeySoft)) softGroups.set(row.nameKeySoft, new Map());
      const salons = softGroups.get(row.nameKeySoft)!;
      if (!salons.has(audit.salon)) salons.set(audit.salon, new Set());
      salons.get(audit.salon)!.add(row.name);
    }
  }

  const similarCrossSalon: CrossSalonMatch[] = [];
  for (const [softKey, salonsMap] of softGroups.entries()) {
    const salons = [...salonsMap.keys()];
    if (salons.length < 2) continue;
    const allRawKeys = new Set<string>();
    for (const audit of fileAudits) {
      for (const row of audit.products) {
        if (row.nameKeySoft === softKey) allRawKeys.add(row.nameKey);
      }
    }
    if (allRawKeys.size <= 1) continue;

    const sampleNamesBySalon: Record<string, string[]> = {};
    let total = 0;
    for (const [salon, names] of salonsMap.entries()) {
      sampleNamesBySalon[salon] = [...names].slice(0, 3);
      total += names.size;
    }
    similarCrossSalon.push({
      normalizedKey: softKey,
      salons,
      totalRecords: total,
      sampleNamesBySalon,
    });
  }
  similarCrossSalon.sort((a, b) => b.salons.length - a.salons.length || b.totalRecords - a.totalRecords);

  const crossSalonRecurrence = [...bySalonKey.entries()]
    .map(([key, entries]) => ({
      normalizedKey: key,
      salonCount: new Set(entries.map((e) => e.salon)).size,
      recordCount: entries.length,
    }))
    .filter((e) => e.salonCount > 1)
    .sort(
      (a, b) =>
        b.salonCount - a.salonCount ||
        b.recordCount - a.recordCount,
    )
    .slice(0, MAX_CROSS_SALON_TOP);

  const report = {
    generatedAt: new Date().toISOString(),
    inputDirectory: "data/imports/products-boss",
    library: "xlsx (SheetJS) — devDependency per lettura .xls/.xlsx",
    filesProcessed: files.length,
    formatNote:
      "Due formati Boss rilevati: statistics (Qtà, Val €, barcode) e inventory (Prezzo, Giacenza, Categoria, Costo).",
    perFile: fileAudits.map(({ products: _p, ...rest }) => rest),
    crossSalon: {
      exactNameMatches: {
        totalKeys: exactCrossSalon.length,
        topExamples: exactCrossSalon.slice(0, MAX_DUPLICATE_EXAMPLES),
      },
      softNormalizedSimilar: {
        totalKeys: similarCrossSalon.length,
        description:
          "Stessa chiave soft (unità rimosse) ma chiavi base diverse tra saloni — possibili stessi prodotti con nome diverso.",
        topExamples: similarCrossSalon.slice(0, MAX_SIMILAR_EXAMPLES),
      },
      topRecurringAcrossSalons: crossSalonRecurrence,
    },
  };

  mkdirSync(INPUT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Audit XLS prodotti Boss (DRY-RUN) ===\n");
  console.log(`File elaborati: ${files.length}`);
  console.log(`Libreria: ${report.library}\n`);

  for (const audit of fileAudits) {
    const sheet = audit.sheets[0];
    console.log(`--- ${audit.salon} (${audit.fileName}) ---`);
    console.log(`  Fogli: ${audit.sheets.map((s) => s.sheetName).join(", ")}`);
    console.log(`  Formato: ${sheet?.exportFormat ?? "?"}`);
    console.log(`  Righe dati: ${audit.totals.allParsedRows} (prodotti ~${audit.totals.productLikeRows}, header cat. ~${audit.totals.likelyCategoryHeaders})`);
    console.log(`  Colonne: ${sheet?.headers.join(" | ") ?? "-"}`);
    console.log(`  Candidate mapping: ${JSON.stringify(sheet?.columnCandidates ?? {})}`);
    console.log(
      `  Qualità: nome vuoto=${audit.quality.emptyName}, qty vuota=${audit.quality.emptyQty}, qty invalida=${audit.quality.invalidQty}, barcode=${audit.quality.withBarcode}`,
    );
    console.log(
      `  Duplicati interni (nome norm.): ${audit.duplicatesWithinSalon.duplicateKeys} chiavi`,
    );
    console.log("  Preview:");
    for (const p of audit.preview.slice(0, CONSOLE_PREVIEW)) {
      console.log(`    ${JSON.stringify(p)}`);
    }
    console.log("");
  }

  console.log("--- Cross-salone ---");
  console.log(`Nomi identici (normalizzazione base) in 2+ saloni: ${exactCrossSalon.length} chiavi`);
  console.log(
    `Possibili simili (normalizzazione soft, nomi raw diversi): ${similarCrossSalon.length} chiavi`,
  );
  console.log("\nTop 10 nomi ricorrenti cross-salone:");
  for (const item of crossSalonRecurrence.slice(0, 10)) {
    console.log(
      `  [${item.salonCount} saloni, ${item.recordCount} record] ${item.normalizedKey.slice(0, 70)}`,
    );
  }

  console.log(`\nReport JSON: ${REPORT_PATH}`);
}

runAudit();
