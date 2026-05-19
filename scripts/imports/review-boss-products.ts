/**
 * Genera file di review manuale prodotti Boss (CSV + JSON, max 300 righe).
 * Usage: npm run review:boss-products
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  enrichWithCanonicalRules,
  loadCanonicalRules,
} from "./bossProductsCanonicalRules.ts";

const REPO_ROOT = process.cwd();
const OUT_DIR = join(REPO_ROOT, "data/imports/products-boss");
const OUT_CSV = join(OUT_DIR, "products-review-priority.csv");
const OUT_JSON = join(OUT_DIR, "products-review-priority.json");
const MAX_ROWS = 300;
const SALON_COUNT_FULL = 5;

type ClassifiedRow = {
  name_normalized: string;
  candidate_name: string;
  salons_count: number;
  salons_names: string[] | null;
  total_rows: number;
  total_qty: number;
  categories: string[] | null;
  source_names: string[] | null;
  avg_price: number | null;
  avg_cost: number | null;
  usage_type: string;
  product_category: string;
  classification_confidence: string;
  rules_matched: string[] | null;
  is_noise: boolean;
};

type SimilarRow = {
  candidate_a: string;
  candidate_b: string;
  salons_overlap: number;
  similarity_reason: string;
};

type ReviewRow = {
  candidate_name: string;
  name_normalized: string;
  usage_type: string;
  product_category: string;
  classification_confidence: string;
  salons_count: number;
  salons_names: string;
  total_qty: number;
  avg_price: number | null;
  avg_cost: number | null;
  estimated_value: number;
  categories: string;
  source_names: string;
  is_noise: boolean;
  review_reasons: string[];
  suggested_action: string;
  manual_canonical_name: string;
  manual_category: string;
  manual_usage_type: string;
  notes: string;
};

function loadEnvLocal(): void {
  const envPath = join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) {
    console.error("Variabile mancante: NEXT_PUBLIC_SUPABASE_URL (in .env.local)");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error("Variabile mancante: SUPABASE_SERVICE_ROLE_KEY (in .env.local)");
    process.exit(1);
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function estimatedValue(qty: number, price: number | null): number {
  return Math.round(Number(qty) * Number(price ?? 0) * 100) / 100;
}

function arrayCell(values: string[] | null): string {
  if (!values?.length) return "";
  return values.join(" | ");
}

function csvEscape(value: string | number | boolean | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(row: ReviewRow): string {
  const cols: (string | number | boolean | null)[] = [
    row.candidate_name,
    row.name_normalized,
    row.usage_type,
    row.product_category,
    row.classification_confidence,
    row.salons_count,
    row.salons_names,
    row.total_qty,
    row.avg_price,
    row.avg_cost,
    row.categories,
    row.source_names,
    row.is_noise,
    row.suggested_action,
    row.manual_canonical_name,
    row.manual_category,
    row.manual_usage_type,
    row.notes,
  ];
  return cols.map(csvEscape).join(",");
}

function toReviewRow(
  r: ClassifiedRow & {
    product_category_effective: string;
    usage_type_effective: string;
  },
  reasons: string[],
  notes = "",
): ReviewRow {
  return {
    candidate_name: r.candidate_name,
    name_normalized: r.name_normalized,
    usage_type: r.usage_type_effective,
    product_category: r.product_category_effective,
    classification_confidence: r.classification_confidence,
    salons_count: r.salons_count,
    salons_names: arrayCell(r.salons_names),
    total_qty: Number(r.total_qty),
    avg_price: r.avg_price,
    avg_cost: r.avg_cost,
    estimated_value: estimatedValue(Number(r.total_qty), r.avg_price),
    categories: arrayCell(r.categories),
    source_names: arrayCell(r.source_names),
    is_noise: r.is_noise,
    review_reasons: reasons,
    suggested_action: "",
    manual_canonical_name: "",
    manual_category: "",
    manual_usage_type: "",
    notes,
  };
}

async function fetchSalonNamesByProduct(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<Map<string, string[]>> {
  const pageSize = 1000;
  const map = new Map<string, string[]>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_master_candidates")
      .select("name_normalized, salons_names")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_master_candidates: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as { name_normalized: string; salons_names: string[] | null }[]) {
      map.set(row.name_normalized, row.salons_names ?? []);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return map;
}

async function fetchAllClassified(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<ClassifiedRow[]> {
  const pageSize = 1000;
  const rows: ClassifiedRow[] = [];
  let offset = 0;

  const salonNamesMap = await fetchSalonNamesByProduct(supabase);

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_classified_candidates")
      .select(
        "name_normalized, candidate_name, salons_count, total_rows, total_qty, categories, source_names, avg_price, avg_cost, usage_type, product_category, classification_confidence, is_noise",
      )
      .order("name_normalized")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_classified_candidates: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as Omit<ClassifiedRow, "salons_names" | "rules_matched">[]) {
      rows.push({
        ...row,
        salons_names: salonNamesMap.get(row.name_normalized) ?? null,
        rules_matched: null,
      });
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function fetchSimilar(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<SimilarRow[]> {
  const { data, error } = await supabase
    .from("products_import_similar_candidates")
    .select("candidate_a, candidate_b, salons_overlap, similarity_reason")
    .order("salons_overlap", { ascending: false })
    .limit(80);

  if (error) throw new Error(`products_import_similar_candidates: ${error.message}`);
  return (data ?? []) as SimilarRow[];
}

function effectiveCategory(
  r: ClassifiedRow,
  enriched?: ReturnType<typeof enrichWithCanonicalRules<ClassifiedRow>>[0],
): string {
  if (enriched?.product_category_after) return enriched.product_category_after;
  return r.product_category;
}

function effectiveUsage(
  r: ClassifiedRow,
  enriched?: ReturnType<typeof enrichWithCanonicalRules<ClassifiedRow>>[0],
): string {
  if (enriched?.usage_type_after) return enriched.usage_type_after;
  return r.usage_type;
}

function buildEffectiveRows(
  all: ClassifiedRow[],
  enrichedMap: Map<string, ReturnType<typeof enrichWithCanonicalRules<ClassifiedRow>>[0]>,
) {
  return all.map((r) => {
    const e = enrichedMap.get(r.name_normalized);
    return {
      ...r,
      product_category_effective: effectiveCategory(r, e),
      usage_type_effective: effectiveUsage(r, e),
    };
  });
}

function pickBucket(
  rows: ReturnType<typeof buildEffectiveRows>,
  filter: (r: (typeof rows)[0]) => boolean,
  sort: (a: (typeof rows)[0], b: (typeof rows)[0]) => number,
  reason: string,
  limit: number,
): Map<string, { row: (typeof rows)[0]; reasons: Set<string> }> {
  const selected = new Map<string, { row: (typeof rows)[0]; reasons: Set<string> }>();
  const sorted = [...rows].filter(filter).sort(sort);
  for (const row of sorted.slice(0, limit)) {
    const existing = selected.get(row.name_normalized);
    if (existing) {
      existing.reasons.add(reason);
    } else {
      selected.set(row.name_normalized, { row, reasons: new Set([reason]) });
    }
  }
  return selected;
}

function mergeBuckets(
  ...buckets: Map<string, { row: ReturnType<typeof buildEffectiveRows>[0]; reasons: Set<string> }>[]
): Map<string, { row: ReturnType<typeof buildEffectiveRows>[0]; reasons: Set<string> }> {
  const merged = new Map<
    string,
    { row: ReturnType<typeof buildEffectiveRows>[0]; reasons: Set<string> }
  >();
  for (const bucket of buckets) {
    for (const [key, val] of bucket) {
      const existing = merged.get(key);
      if (existing) {
        for (const reason of val.reasons) existing.reasons.add(reason);
      } else {
        merged.set(key, { row: val.row, reasons: new Set(val.reasons) });
      }
    }
  }
  return merged;
}

function priorityScore(reasons: Set<string>, row: ReturnType<typeof buildEffectiveRows>[0]): number {
  let score = 0;
  if (reasons.has("unknown_top_qty")) score += 1000;
  if (reasons.has("unknown_top_value")) score += 900;
  if (reasons.has("present_in_5_salons")) score += 800;
  if (reasons.has("similar_candidate")) score += 700;
  if (reasons.has("top_retail_qty")) score += 400;
  if (reasons.has("top_salon_use_qty")) score += 400;
  if (reasons.has("top_dual_use_qty")) score += 400;
  score += Number(row.total_qty);
  score += estimatedValue(Number(row.total_qty), row.avg_price) / 10;
  if (row.product_category_effective === "unknown") score += 200;
  return score;
}

async function runBossProductsReview(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const [all, similar] = await Promise.all([
    fetchAllClassified(supabase),
    fetchSimilar(supabase),
  ]);

  const canonicalRules = loadCanonicalRules();
  const enriched = canonicalRules ? enrichWithCanonicalRules(all, canonicalRules) : null;
  const enrichedMap = new Map(
    (enriched ?? []).map((r) => [r.name_normalized, r]),
  );

  const effective = buildEffectiveRows(all, enrichedMap);
  const byName = new Map(effective.map((r) => [r.name_normalized, r]));

  const nonNoise = effective.filter((r) => !r.is_noise);

  const bucketUnknownQty = pickBucket(
    nonNoise,
    (r) => r.product_category_effective === "unknown",
    (a, b) => Number(b.total_qty) - Number(a.total_qty),
    "unknown_top_qty",
    80,
  );

  const bucketUnknownValue = pickBucket(
    nonNoise,
    (r) => r.product_category_effective === "unknown",
    (a, b) =>
      estimatedValue(Number(b.total_qty), b.avg_price)
      - estimatedValue(Number(a.total_qty), a.avg_price),
    "unknown_top_value",
    80,
  );

  const bucketRetail = pickBucket(
    nonNoise,
    (r) => r.usage_type_effective === "retail",
    (a, b) => Number(b.total_qty) - Number(a.total_qty),
    "top_retail_qty",
    50,
  );

  const bucketSalon = pickBucket(
    nonNoise,
    (r) => r.usage_type_effective === "salon_use",
    (a, b) => Number(b.total_qty) - Number(a.total_qty),
    "top_salon_use_qty",
    50,
  );

  const bucketDual = pickBucket(
    nonNoise,
    (r) => r.usage_type_effective === "dual_use",
    (a, b) => Number(b.total_qty) - Number(a.total_qty),
    "top_dual_use_qty",
    50,
  );

  const bucketFiveSalons = pickBucket(
    nonNoise,
    (r) => r.salons_count >= SALON_COUNT_FULL,
    (a, b) => Number(b.total_qty) - Number(a.total_qty),
    "present_in_5_salons",
    80,
  );

  const bucketSimilar = new Map<
    string,
    { row: (typeof effective)[0]; reasons: Set<string> }
  >();
  for (const pair of similar) {
    for (const norm of [pair.candidate_a, pair.candidate_b]) {
      const row = byName.get(norm);
      if (!row || row.is_noise) continue;
      const existing = bucketSimilar.get(norm);
      const note = `similar:${pair.candidate_a} <> ${pair.candidate_b} (${pair.similarity_reason})`;
      if (existing) {
        existing.reasons.add("similar_candidate");
        existing.row = row;
      } else {
        bucketSimilar.set(norm, {
          row,
          reasons: new Set(["similar_candidate"]),
        });
      }
    }
  }

  const merged = mergeBuckets(
    bucketUnknownQty,
    bucketUnknownValue,
    bucketRetail,
    bucketSalon,
    bucketDual,
    bucketFiveSalons,
    bucketSimilar,
  );

  const sorted = [...merged.values()]
    .map((entry) => ({
      entry,
      score: priorityScore(entry.reasons, entry.row),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ROWS);

  const reviewRows: ReviewRow[] = sorted.map(({ entry }) => {
    const similarNote = [...entry.reasons].includes("similar_candidate")
      ? similar
          .filter(
            (p) =>
              p.candidate_a === entry.row.name_normalized
              || p.candidate_b === entry.row.name_normalized,
          )
          .slice(0, 2)
          .map((p) => `${p.candidate_a} <> ${p.candidate_b} (${p.similarity_reason})`)
          .join("; ")
      : "";
    return toReviewRow(entry.row, [...entry.reasons], similarNote);
  });

  const csvHeader = [
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
  ].join(",");

  const csvBody = reviewRows.map(toCsvRow).join("\n");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_CSV, `${csvHeader}\n${csvBody}\n`, "utf8");

  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    maxRows: MAX_ROWS,
    totalCandidatesMerged: merged.size,
    rowsInReview: reviewRows.length,
    canonicalRulesApplied: Boolean(canonicalRules),
    rows: reviewRows,
  };
  writeFileSync(OUT_JSON, `${JSON.stringify(jsonPayload, null, 2)}\n`, "utf8");

  const topUnknown = reviewRows
    .filter((r) => r.product_category === "unknown")
    .sort((a, b) => b.total_qty - a.total_qty)
    .slice(0, 20);

  console.log("=== Review manuale prodotti Boss ===\n");
  console.log(`Prodotti in review (file): ${reviewRows.length} (max ${MAX_ROWS})`);
  console.log(`Candidati unici selezionati (pre-cap): ${merged.size}`);
  console.log(`Regole canoniche applicate: ${canonicalRules ? "sì" : "no"}`);
  console.log(`\nFile CSV:  ${OUT_CSV}`);
  console.log(`File JSON: ${OUT_JSON}`);

  console.log("\n--- Top 20 unknown importanti (per qty nel file review) ---");
  for (const r of topUnknown) {
    console.log(
      `  [qty=${r.total_qty} val=${r.estimated_value}] ${r.candidate_name.slice(0, 55)} | ${r.review_reasons.join(", ")}`,
    );
  }

  console.log("\npublic.products / product_stock NON modificati.");
}

runBossProductsReview().catch((error: unknown) => {
  console.error("Review fallita:", error instanceof Error ? error.message : error);
  process.exit(1);
});
