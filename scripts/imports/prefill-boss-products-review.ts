/**
 * Precompila products-review-priority.csv con regole conservative.
 * Usage: npm run prefill:boss-products-review
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const INPUT_CSV = join(REPO_ROOT, "data/imports/products-boss/products-review-priority.csv");
const OUTPUT_CSV = join(
  REPO_ROOT,
  "data/imports/products-boss/products-review-priority-prefilled.csv",
);

const HIGH_QTY_THRESHOLD = 35;

const CSV_COLUMNS = [
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

type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

type PrefillResult = {
  suggested_action: string;
  manual_category: string;
  manual_usage_type: string;
  notes: string;
  ruleId: string;
};

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

function parseCsv(content: string): CsvRow[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {} as CsvRow;
    for (let c = 0; c < headers.length; c++) {
      row[headers[c] as (typeof CSV_COLUMNS)[number]] = values[c] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowToCsvLine(row: CsvRow): string {
  return CSV_COLUMNS.map((col) => csvEscape(row[col] ?? "")).join(",");
}

function haystack(row: CsvRow): string {
  return `${row.candidate_name} ${row.name_normalized} ${row.categories}`.toLowerCase();
}

function qty(row: CsvRow): number {
  return Number(row.total_qty) || 0;
}

function isUnknownCategory(row: CsvRow): boolean {
  return row.product_category === "unknown" || !row.product_category;
}

function usageFromBossCategory(row: CsvRow, fallback: string): string {
  const cat = row.categories.toLowerCase();
  if (cat.includes("uso interno") && cat.includes("rivendita")) return "dual_use";
  if (cat.includes("rivendita") || cat.includes("store")) return "retail";
  if (cat.includes("uso salone")) return "salon_use";
  if (cat.includes("uso interno")) return "internal_use";
  return fallback;
}

function matchAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

function applyPrefillRules(row: CsvRow): PrefillResult | null {
  const text = haystack(row);
  const q = qty(row);

  if (matchAny(text, ["fiori", "gadget natalizio", "gadget natale", "christmas", " wall decor", "decor", "appendini cuore"])) {
    return {
      suggested_action: "exclude",
      manual_category: "accessori",
      manual_usage_type: "retail",
      notes: "Decorativo / stagionale — escludere se non a catalogo",
      ruleId: "exclude_decorative",
    };
  }

  if (
    matchAny(text, [
      "direct color",
      "luxury natural touch",
      "odm crema color",
      "odm color",
      "j color",
      "joc color",
    ])
  ) {
    return {
      suggested_action: "keep_exact",
      manual_category: "colori",
      manual_usage_type: usageFromBossCategory(row, "salon_use"),
      notes: "Linea colore — mantenere nome esatto",
      ruleId: "keep_exact_colori",
    };
  }

  if (matchAny(text, ["henne", "henné", "mallo", "emolliente scaramuzzo", "miscele erbe", "erbe riflessanti"])) {
    return {
      suggested_action: "keep_exact",
      manual_category: "erbe",
      manual_usage_type: usageFromBossCategory(row, "dual_use"),
      notes: "Linea erbe / henné — mantenere nome esatto",
      ruleId: "keep_exact_erbe",
    };
  }

  if (matchAny(text, ["foulard grande", "foulard piccolo", "foulard"]) && matchAny(text, ["logo"])) {
    return {
      suggested_action: "import",
      manual_category: "accessori",
      manual_usage_type: "retail",
      notes: "Merchandising / logo",
      ruleId: "import_foulard_logo",
    };
  }

  if (matchAny(text, ["salviette corpo-viso", "salviette corpo viso"])) {
    return {
      suggested_action: "import",
      manual_category: "consumabili",
      manual_usage_type: "dual_use",
      notes: "Consumabile uso salone / rivendita",
      ruleId: "import_salviette",
    };
  }

  if (matchAny(text, ["cuffietnt monouso", "cuffie tnt", "cuffietta", "cuffiet"])) {
    return {
      suggested_action: "import",
      manual_category: "consumabili",
      manual_usage_type: "salon_use",
      notes: "Consumabile monouso salone",
      ruleId: "import_cuffie_tnt",
    };
  }

  if (matchAny(text, ["lama sgorbia", "lama "])) {
    return {
      suggested_action: "import",
      manual_category: "attrezzatura",
      manual_usage_type: "salon_use",
      notes: "Attrezzatura taglio / salone",
      ruleId: "import_lama_sgorbia",
    };
  }

  if (matchAny(text, ["quicktreat"])) {
    return {
      suggested_action: "keep_exact",
      manual_category: "trattamenti",
      manual_usage_type: "salon_use",
      notes: "Trattamento — mantenere nome esatto",
      ruleId: "keep_exact_quicktreat",
    };
  }

  if (matchAny(text, ["aghi elettrodepilazione", "aghi epilazione"])) {
    return {
      suggested_action: "import",
      manual_category: "attrezzatura",
      manual_usage_type: "salon_use",
      notes: "Attrezzatura epilazione",
      ruleId: "import_aghi_epilazione",
    };
  }

  if (
    matchAny(text, ["olio solare", "abbronzante", "gadget olio super abbronzante"])
    && !matchAny(text, ["idratante mandarino"])
  ) {
    return {
      suggested_action: "keep_exact",
      manual_category: "cosmetica",
      manual_usage_type: "retail",
      notes: "Linea solare — mantenere nome esatto",
      ruleId: "keep_exact_olio_solare",
    };
  }

  if (
    matchAny(text, [
      "maschera nutriente",
      "maschera liquida",
      "maschera ristrutturante",
      "maschera riflessante",
    ])
  ) {
    return {
      suggested_action: "keep_exact",
      manual_category: "conditioner_maschere",
      manual_usage_type: "dual_use",
      notes: "Maschera — mantenere nome esatto",
      ruleId: "keep_exact_maschera",
    };
  }

  if (matchAny(text, ["firming treatment"])) {
    return {
      suggested_action: "keep_exact",
      manual_category: "trattamenti",
      manual_usage_type: "retail",
      notes: "Trattamento — mantenere nome esatto",
      ruleId: "keep_exact_firming_treatment",
    };
  }

  if (matchAny(text, ["olio idratante", "idratante con estr mandarino", "mandarino 150ml"])) {
    return {
      suggested_action: "keep_exact",
      manual_category: "cosmetica",
      manual_usage_type: "retail",
      notes: "Cosmetica corpo — mantenere nome esatto",
      ruleId: "keep_exact_olio_idratante",
    };
  }

  if (matchAny(text, ["poncio colorati"])) {
    return {
      suggested_action: "import",
      manual_category: "accessori",
      manual_usage_type: "retail",
      notes: "Verificare se ancora venduto",
      ruleId: "import_poncio_colorati",
    };
  }

  if (matchAny(text, ["styling cream curl"])) {
    return {
      suggested_action: "keep_exact",
      manual_category: "styling",
      manual_usage_type: "retail",
      notes: "Styling — mantenere nome esatto",
      ruleId: "keep_exact_styling_cream_curl",
    };
  }

  if (matchAny(text, ["solvente parisienne"])) {
    return {
      suggested_action: "import",
      manual_category: "pulizia",
      manual_usage_type: "salon_use",
      notes: "Solvente uso salone",
      ruleId: "import_solvente_parisienne",
    };
  }

  if (matchAny(text, ["rotolo lettino", "cotone 400", "cotone ", "fasce tnt", "pennell", "tint brush", "guanti", "stagnola"])) {
    const isAttrezzatura = matchAny(text, ["pennell", "tint brush"]);
    return {
      suggested_action: "import",
      manual_category: isAttrezzatura ? "attrezzatura" : "consumabili",
      manual_usage_type: matchAny(text, ["guanti", "stagnola", "cotone"])
        ? "internal_use"
        : "salon_use",
      notes: "Consumabile / attrezzatura salone",
      ruleId: "import_consumabili_attrezzatura",
    };
  }

  if (matchAny(text, ["pochette", "scatola piccola", "scatola ", "sacchetto natalizio", "sacchetto "])) {
    return {
      suggested_action: "import",
      manual_category: "accessori",
      manual_usage_type: "retail",
      notes: "Verificare retail / accessori",
      ruleId: "import_packaging_verify",
    };
  }

  if (matchAny(text, ["collant", "occhiali", "trucchi"])) {
    const category = matchAny(text, ["trucchi", "olio", "crema", "solvente"])
      ? "cosmetica"
      : "accessori";
    return {
      suggested_action: "import",
      manual_category: category,
      manual_usage_type: "retail",
      notes: "Verificare se ancora venduto",
      ruleId: "import_retail_verify",
    };
  }

  if (isUnknownCategory(row) && q >= HIGH_QTY_THRESHOLD) {
    return {
      suggested_action: "",
      manual_category: "",
      manual_usage_type: "",
      notes: "Review manuale — categoria unknown con qty alta",
      ruleId: "manual_review_high_qty",
    };
  }

  return null;
}

function runPrefillBossProductsReview(): void {
  if (!existsSync(INPUT_CSV)) {
    console.error(`File non trovato: ${INPUT_CSV}`);
    console.error("Esegui prima: npm run review:boss-products");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(INPUT_CSV, "utf8"));
  if (rows.length === 0) {
    console.error("CSV review vuoto.");
    process.exit(1);
  }

  const stats = {
    import: 0,
    exclude: 0,
    keep_exact: 0,
    merge_generic: 0,
    empty: 0,
    total: rows.length,
  };

  const ruleHits = new Map<string, number>();

  for (const row of rows) {
    const prefill = applyPrefillRules(row);
    if (!prefill) {
      stats.empty++;
      continue;
    }

    row.suggested_action = prefill.suggested_action;
    row.manual_category = prefill.manual_category;
    row.manual_usage_type = prefill.manual_usage_type;
    row.notes = prefill.notes;

    ruleHits.set(prefill.ruleId, (ruleHits.get(prefill.ruleId) ?? 0) + 1);

    if (prefill.suggested_action === "import") stats.import++;
    else if (prefill.suggested_action === "exclude") stats.exclude++;
    else if (prefill.suggested_action === "keep_exact") stats.keep_exact++;
    else if (prefill.suggested_action === "merge_generic") stats.merge_generic++;
    else stats.empty++;
  }

  const csvOut = [CSV_COLUMNS.join(","), ...rows.map(rowToCsvLine)].join("\n") + "\n";
  mkdirSync(join(REPO_ROOT, "data/imports/products-boss"), { recursive: true });
  writeFileSync(OUTPUT_CSV, csvOut, "utf8");

  const stillToReview = rows
    .filter((r) => !r.suggested_action || r.notes.includes("Review manuale"))
    .sort((a, b) => qty(b) - qty(a))
    .slice(0, 20);

  console.log("=== Prefill review prodotti Boss ===\n");
  console.log(`Righe elaborate: ${stats.total}`);
  console.log(`Output: ${OUTPUT_CSV}\n`);
  console.log("--- suggested_action ---");
  console.log(`  import: ${stats.import}`);
  console.log(`  exclude: ${stats.exclude}`);
  console.log(`  keep_exact: ${stats.keep_exact}`);
  console.log(`  merge_generic: ${stats.merge_generic}`);
  console.log(`  vuoto / review manuale: ${stats.empty}\n`);

  console.log("--- Top regole applicate ---");
  for (const [id, count] of [...ruleHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${id}: ${count}`);
  }

  console.log("\n--- Top 20 ancora da rivedere ---");
  for (const r of stillToReview) {
    const action = r.suggested_action || "(vuoto)";
    console.log(
      `  [qty=${r.total_qty}] ${action} | ${r.candidate_name.slice(0, 50)} | ${r.notes || "-"}`,
    );
  }

  console.log("\npublic.products / product_stock NON modificati.");
}

runPrefillBossProductsReview();
