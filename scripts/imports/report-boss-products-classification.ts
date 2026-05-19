/**
 * Report classificazione prodotti Boss (read-only).
 * Usage: npm run report:boss-products:classification
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_CANONICAL_RULES_PATH,
  enrichWithCanonicalRules,
  loadCanonicalRules,
  type ClassifiedWithCanonical,
} from "./bossProductsCanonicalRules.ts";

const REPO_ROOT = process.cwd();
const REPORT_PATH = join(
  REPO_ROOT,
  "data/imports/products-boss/products-classification-report.json",
);
const SALON_COUNT_FULL = 5;
const TOP_N = 25;
const EXAMPLES_PER_CATEGORY = 5;

type ClassifiedRow = {
  name_normalized: string;
  candidate_name: string;
  salons_count: number;
  total_rows: number;
  total_qty: number;
  categories: string[] | null;
  usage_type: string;
  product_category: string;
  classification_confidence: string;
  rules_matched: string[];
  is_noise: boolean;
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

async function fetchAllClassified(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<ClassifiedRow[]> {
  const pageSize = 1000;
  const rows: ClassifiedRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_classified_candidates")
      .select(
        "name_normalized, candidate_name, salons_count, total_rows, total_qty, categories, usage_type, product_category, classification_confidence, rules_matched, is_noise",
      )
      .order("name_normalized")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_classified_candidates: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ClassifiedRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function countCategoryUnknown(rows: ClassifiedRow[]): number {
  return rows.filter((r) => r.product_category === "unknown").length;
}

function countCategoryUnknownAfter(
  rows: ClassifiedWithCanonical<ClassifiedRow>[],
): number {
  return rows.filter((r) => r.product_category_after === "unknown").length;
}

function countField(rows: ClassifiedRow[], field: keyof ClassifiedRow): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const v = String(r[field]);
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

function countCategoryField(
  rows: (ClassifiedRow | ClassifiedWithCanonical<ClassifiedRow>)[],
  getter: (r: ClassifiedRow | ClassifiedWithCanonical<ClassifiedRow>) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const v = getter(r);
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

function topExamples(
  rows: ClassifiedRow[],
  filter: (r: ClassifiedRow) => boolean,
  limit: number,
): { name: string; salonsCount: number; totalQty: number; usageType: string; productCategory: string }[] {
  return rows
    .filter(filter)
    .sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
    .slice(0, limit)
    .map((r) => ({
      name: r.candidate_name,
      salonsCount: r.salons_count,
      totalQty: Number(r.total_qty),
      usageType: r.usage_type,
      productCategory: r.product_category,
    }));
}

function importableCleanRows(
  rows: {
    is_noise: boolean;
    product_category: string;
    usage_type: string;
    total_qty: number;
  }[],
): number {
  return rows.filter(
    (r) =>
      !r.is_noise
      && r.product_category !== "unknown"
      && r.usage_type !== "unknown"
      && Number(r.total_qty) > 0,
  ).length;
}

function buildCanonicalReportSection(
  enriched: ClassifiedWithCanonical<ClassifiedRow>[],
  rulesPath: string,
) {
  const applied = enriched.filter((r) => r.canonical_rule_id !== null);
  const ruleUsage = new Map<string, number>();
  for (const r of applied) {
    const id = r.canonical_rule_id!;
    ruleUsage.set(id, (ruleUsage.get(id) ?? 0) + 1);
  }

  const topRulesUsed = [...ruleUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ruleId, count]) => ({ ruleId, count }));

  const canonicalizedExamples = applied
    .sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
    .slice(0, 30)
    .map((r) => ({
      originalName: r.candidate_name,
      nameNormalized: r.name_normalized,
      canonicalName: r.canonical_name,
      ruleId: r.canonical_rule_id,
      strategy: r.canonical_strategy,
      categoryBefore: r.product_category,
      categoryAfter: r.product_category_after,
      usageAfter: r.usage_type_after,
      totalQty: Number(r.total_qty),
    }));

  const unknownBefore = countCategoryUnknown(enriched);
  const unknownAfter = countCategoryUnknownAfter(enriched);

  return {
    rulesFile: rulesPath,
    rulesLoaded: applied.length > 0 || existsSync(rulesPath),
    unknownCategoryBefore: unknownBefore,
    unknownCategoryAfter: unknownAfter,
    unknownReduced: unknownBefore - unknownAfter,
    rulesAppliedCount: applied.length,
    importableCleanAfterCanonical: importableCleanRows(
      enriched.map((r) => ({
        is_noise: r.is_noise,
        product_category: r.product_category_after,
        usage_type: r.usage_type_after,
        total_qty: r.total_qty,
      })),
    ),
    topRulesUsed,
    canonicalizedExamples,
  };
}

async function runBossProductsClassificationReport(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();
  const all = await fetchAllClassified(supabase);

  const canonicalRules = loadCanonicalRules();
  const enriched = canonicalRules
    ? enrichWithCanonicalRules(all, canonicalRules)
    : null;

  const rowsForCategoryCounts = enriched ?? all;
  const getCategory = (r: ClassifiedRow | ClassifiedWithCanonical<ClassifiedRow>) =>
    "product_category_after" in r && canonicalRules
      ? r.product_category_after
      : r.product_category;

  const clean = importableCleanRows(
    rowsForCategoryCounts.map((r) => ({
      is_noise: r.is_noise,
      product_category: getCategory(r),
      usage_type: r.usage_type,
      total_qty: r.total_qty,
    })),
  );

  const usageCounts = countField(all, "usage_type");
  const categoryCounts = countCategoryField(rowsForCategoryCounts, (r) => getCategory(r));
  const confidenceCounts = countField(all, "classification_confidence");

  const productCategories = [
    "lavaggio",
    "conditioner_maschere",
    "styling",
    "colori",
    "ossigeni",
    "decolorazione",
    "gloss_tonalizzanti",
    "trattamenti",
    "erbe",
    "attrezzatura",
    "consumabili",
    "pulizia",
    "cosmetica",
    "profumi",
    "accessori",
    "altro",
    "unknown",
  ] as const;

  const examplesByCategory: Record<string, ReturnType<typeof topExamples>> = {};
  const inAllSalonsByCategory: Record<string, number> = {};
  const importableByCategory: Record<string, number> = {};

  for (const cat of productCategories) {
    examplesByCategory[cat] = topExamples(
      all,
      (r) => getCategory(r) === cat && !r.is_noise,
      EXAMPLES_PER_CATEGORY,
    );
    inAllSalonsByCategory[cat] = rowsForCategoryCounts.filter(
      (r) => getCategory(r) === cat && r.salons_count >= SALON_COUNT_FULL && !r.is_noise,
    ).length;
    importableByCategory[cat] = rowsForCategoryCounts.filter(
      (r) =>
        getCategory(r) === cat
        && !r.is_noise
        && r.usage_type !== "unknown"
        && Number(r.total_qty) > 0,
    ).length;
  }

  const probableErrors = all
    .filter(
      (r) =>
        !r.is_noise
        && (
          (r.usage_type === "unknown" && r.product_category !== "unknown")
          || (r.product_category === "unknown" && r.usage_type !== "unknown")
          || (r.classification_confidence === "low" && Number(r.total_qty) > 10)
        ),
    )
    .sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
    .slice(0, 30)
    .map((r) => ({
      name: r.candidate_name,
      usageType: r.usage_type,
      productCategory: r.product_category,
      confidence: r.classification_confidence,
      categories: r.categories,
      rulesMatched: r.rules_matched,
      totalQty: Number(r.total_qty),
    }));

  const canonicalSection =
    enriched && canonicalRules
      ? buildCanonicalReportSection(enriched, DEFAULT_CANONICAL_RULES_PATH)
      : {
          rulesFile: DEFAULT_CANONICAL_RULES_PATH,
          rulesLoaded: false,
          note: "product-canonical-rules.json non trovato",
        };

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      classifiedProducts: all.length,
      noiseFlagged: all.filter((r) => r.is_noise).length,
      importableCleanEstimate: clean,
    },
    canonicalRules: canonicalSection,
    usageTypeCounts: usageCounts,
    productCategoryCounts: categoryCounts,
    confidenceCounts: confidenceCounts,
    unknownAndAltro: {
      usageUnknown: usageCounts.unknown ?? 0,
      categoryUnknown: categoryCounts.unknown ?? 0,
      categoryAltro: categoryCounts.altro ?? 0,
    },
    topUnknown: topExamples(
      rowsForCategoryCounts as ClassifiedRow[],
      (r) => getCategory(r) === "unknown" && !r.is_noise,
      TOP_N,
    ),
    topAltro: topExamples(all, (r) => r.product_category === "altro" && !r.is_noise, TOP_N),
    topNoise: topExamples(all, (r) => r.is_noise, TOP_N),
    examplesByCategory,
    presentInAllFiveSalonsByCategory: inAllSalonsByCategory,
    importableCleanByCategory: importableByCategory,
    probableClassificationErrors: probableErrors,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Classificazione prodotti Boss ===\n");
  console.log(`Prodotti classificati: ${all.length}`);
  console.log(`Rumore (is_noise): ${report.totals.noiseFlagged}`);
  console.log(`Importabile pulito (stima): ${clean}\n`);

  if (canonicalRules && enriched && "unknownCategoryBefore" in canonicalSection) {
    const c = canonicalSection as ReturnType<typeof buildCanonicalReportSection>;
    console.log("--- Regole canoniche locali ---");
    console.log(`File: ${c.rulesFile}`);
    console.log(`Unknown categoria prima: ${c.unknownCategoryBefore}`);
    console.log(`Unknown categoria dopo: ${c.unknownCategoryAfter}`);
    console.log(`Riduzione: ${c.unknownReduced} (${c.rulesAppliedCount} regole applicate)`);
    console.log(`Importabile pulito dopo regole: ${c.importableCleanAfterCanonical}`);
    console.log("\nTop regole usate:");
    for (const t of c.topRulesUsed.slice(0, 10)) {
      console.log(`  ${t.ruleId}: ${t.count}`);
    }
    console.log("\nEsempi canonizzati:");
    for (const ex of c.canonicalizedExamples.slice(0, 8)) {
      console.log(
        `  ${ex.originalName.slice(0, 50)} → ${ex.canonicalName} [${ex.ruleId}] ${ex.categoryBefore}→${ex.categoryAfter}`,
      );
    }
    console.log("");
  }

  console.log("--- usage_type ---");
  for (const [k, v] of Object.entries(usageCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("\n--- product_category (top 10) ---");
  for (const [k, v] of Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("\n--- confidence ---");
  for (const [k, v] of Object.entries(confidenceCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  console.log(
    `\nunknown usage: ${report.unknownAndAltro.usageUnknown} | unknown category: ${report.unknownAndAltro.categoryUnknown} | altro: ${report.unknownAndAltro.categoryAltro}`,
  );
  console.log(`\nReport JSON: ${REPORT_PATH}`);
  console.log("\npublic.products / product_stock NON modificati.");
}

runBossProductsClassificationReport().catch((error: unknown) => {
  console.error("Report fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
