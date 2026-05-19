/**
 * Parsing conmotione export Boss MAG002 (MAGAZZINO VALORE) da file .xls.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";

export const BOSS_PRODUCTS_SOURCE = "boss";

export type BossProductSalon = {
  id: number;
  name: string;
  fileName: string;
  sourceFile: string;
};

/** Cinque export ufficiali (solo questi file, non varianti duplicate in cartella). */
export const BOSS_PRODUCT_SALONS: BossProductSalon[] = [
  {
    id: 1,
    name: "Roma",
    fileName: "Prodotti Roma.xls",
    sourceFile: "data/imports/products-boss/Prodotti Roma.xls",
  },
  {
    id: 2,
    name: "Corigliano",
    fileName: "Prodotti Corigliano.xls",
    sourceFile: "data/imports/products-boss/Prodotti Corigliano.xls",
  },
  {
    id: 3,
    name: "Castrovillari",
    fileName: "Prodotti Castrovillari.xls",
    sourceFile: "data/imports/products-boss/Prodotti Castrovillari.xls",
  },
  {
    id: 4,
    name: "Cosenza",
    fileName: "Prodotti Cosenza.xls",
    sourceFile: "data/imports/products-boss/Prodotti Cosenza.xls",
  },
  {
    id: 5,
    name: "Magazzino Centrale",
    fileName: "Prodotti Magazzino-Centrale.xls",
    sourceFile: "data/imports/products-boss/Prodotti Magazzino-Centrale.xls",
  },
];

/** Varianti nome file (Boss a volte esporta con spazio prima di .xls). */
export function resolveBossProductFilePath(
  repoRoot: string,
  salon: BossProductSalon,
): string | null {
  const dir = join(repoRoot, "data/imports/products-boss");
  const base = salon.fileName.replace(/\.xls$/i, "");
  const candidates = [
    salon.fileName,
    `${base} .xls`,
    `${base}.xls`,
  ];
  for (const name of candidates) {
    const path = join(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

export const INVENTORY_HEADERS = [
  "Descrizione",
  "Prezzo (€)",
  "Categoria",
  "Giacenza",
  "Costo unitario (€)",
  "Costo medio (€)",
  "Valore acquisto (€)",
  "Valore medio (€)",
] as const;

export type InventoryColumnIndices = {
  name: number;
  price: number;
  category: number;
  qty: number;
  costUnit: number;
};

const COL: InventoryColumnIndices = {
  name: 0,
  price: 1,
  category: 2,
  qty: 3,
  costUnit: 4,
};

export type ParsedBossProductRow = {
  sourceRowNumber: number;
  raw: Record<string, string | number | null>;
  nameRaw: string;
  nameNormalized: string;
  categoryRaw: string | null;
  categoryNormalized: string | null;
  qtyRaw: string | null;
  qty: number | null;
  priceRaw: string | null;
  price: number | null;
  costRaw: string | null;
  cost: number | null;
  importWarnings: string[];
  skip: boolean;
};

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Normalizzazione nome prodotto (non aggressiva). */
export function normalizeProductName(raw: string): string {
  return normalizeSpaces(
    raw
      .toLowerCase()
      .replace(/[.,;:'"()[\]/\\!?]+/g, " ")
      .replace(/\s+/g, " "),
  );
}

/** Normalizzazione categoria/reparto. */
export function normalizeCategory(raw: string): string {
  return normalizeSpaces(raw.toLowerCase());
}

export function parseNumeric(value: unknown): {
  valid: boolean;
  num: number | null;
  raw: string;
} {
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

function getCell(row: unknown[], index: number): unknown {
  return Array.isArray(row) ? row[index] : "";
}

export function isInventoryMag002Headers(headers: string[]): boolean {
  if (headers.length < 5) return false;
  return (
    /^descrizione$/i.test(headers[COL.name] ?? "") &&
    /prezzo/i.test(headers[COL.price] ?? "") &&
    /^categoria$/i.test(headers[COL.category] ?? "") &&
    /^giacenza$/i.test(headers[COL.qty] ?? "") &&
    /costo unitario/i.test(headers[COL.costUnit] ?? "")
  );
}

export function isSkippableProductRow(nameRaw: string, nameNormalized: string): boolean {
  if (!nameRaw) return true;
  if (/^totali:?$/i.test(nameNormalized)) return true;
  return false;
}

function rowToRawObject(headers: string[], row: unknown[]): Record<string, string | number | null> {
  const raw: Record<string, string | number | null> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i] || `col_${i}`;
    const v = getCell(row, i);
    if (v === "" || v === null || v === undefined) {
      raw[key] = null;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      raw[key] = v;
    } else {
      raw[key] = cellToString(v);
    }
  }
  return raw;
}

export function buildBossProductStagingRow(
  headers: string[],
  row: unknown[],
  sourceRowNumber: number,
): ParsedBossProductRow {
  const warnings: string[] = [];
  const raw = rowToRawObject(headers, row);

  const nameRaw = normalizeSpaces(cellToString(getCell(row, COL.name)));
  const nameNormalized = normalizeProductName(nameRaw);

  if (!nameRaw) warnings.push("name_empty");

  const categoryRaw = cellToString(getCell(row, COL.category)) || null;
  const categoryNormalized = categoryRaw ? normalizeCategory(categoryRaw) : null;

  const qtyParsed = parseNumeric(getCell(row, COL.qty));
  const priceParsed = parseNumeric(getCell(row, COL.price));
  const costParsed = parseNumeric(getCell(row, COL.costUnit));

  if (qtyParsed.raw && !qtyParsed.valid) warnings.push("qty_invalid");
  if (priceParsed.raw && !priceParsed.valid) warnings.push("price_invalid");
  if (costParsed.raw && !costParsed.valid) warnings.push("cost_invalid");

  const skip = isSkippableProductRow(nameRaw, nameNormalized);

  return {
    sourceRowNumber,
    raw,
    nameRaw,
    nameNormalized: nameNormalized || "",
    categoryRaw,
    categoryNormalized,
    qtyRaw: qtyParsed.raw || null,
    qty: qtyParsed.valid ? qtyParsed.num : null,
    priceRaw: priceParsed.raw || null,
    price: priceParsed.valid ? priceParsed.num : null,
    costRaw: costParsed.raw || null,
    cost: costParsed.valid ? costParsed.num : null,
    importWarnings: warnings,
    skip,
  };
}

export type ParsedBossProductFile = {
  salon: BossProductSalon;
  sheetName: string;
  headers: string[];
  rows: ParsedBossProductRow[];
  formatError: string | null;
};

export function parseBossProductXlsFile(
  absolutePath: string,
  salon: BossProductSalon,
): ParsedBossProductFile {
  const buffer = readFileSync(absolutePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0] ?? "";
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return {
      salon,
      sheetName,
      headers: [],
      rows: [],
      formatError: "foglio_vuoto",
    };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  if (matrix.length === 0) {
    return {
      salon,
      sheetName,
      headers: [],
      rows: [],
      formatError: "file_vuoto",
    };
  }

  const headers = (matrix[0] ?? []).map((c) => cellToString(c));
  if (!isInventoryMag002Headers(headers)) {
    return {
      salon,
      sheetName,
      headers,
      rows: [],
      formatError: "formato_non_mag002_inventory",
    };
  }

  const rows: ParsedBossProductRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || !row.some((c) => cellToString(c) !== "")) continue;
    const parsed = buildBossProductStagingRow(headers, row, i + 1);
    if (parsed.skip) continue;
    rows.push(parsed);
  }

  return { salon, sheetName, headers, rows, formatError: null };
}
