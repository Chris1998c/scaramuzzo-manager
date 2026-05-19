/**
 * Parse CSV review prodotti Boss (priority / prefilled).
 */

import { readFileSync, writeFileSync } from "node:fs";

export const REVIEW_CSV_COLUMNS = [
  "candidate_name",
  "name_normalized",
  "usage_type",
  "product_category",
  "classification_confidence",
  "salons_count",
  "salons_names",
  "total_qty",
  "avg_price",
  "avg_cost",
  "categories",
  "source_names",
  "is_noise",
  "suggested_action",
  "manual_canonical_name",
  "manual_category",
  "manual_usage_type",
  "notes",
] as const;

export type ReviewCsvRow = Record<(typeof REVIEW_CSV_COLUMNS)[number], string>;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function parseReviewCsv(content: string): ReviewCsvRow[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: ReviewCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {} as ReviewCsvRow;
    for (let c = 0; c < headers.length; c++) {
      row[headers[c] as (typeof REVIEW_CSV_COLUMNS)[number]] = values[c] ?? "";
    }
    if (row.name_normalized?.trim()) rows.push(row);
  }

  return rows;
}

export function readReviewCsv(path: string): ReviewCsvRow[] {
  return parseReviewCsv(readFileSync(path, "utf8"));
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function writeReviewCsv(path: string, rows: ReviewCsvRow[]): void {
  const lines = [
    REVIEW_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      REVIEW_CSV_COLUMNS.map((col) => csvEscape(row[col] ?? "")).join(","),
    ),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}
