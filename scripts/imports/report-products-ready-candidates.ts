/**
 * Report candidati pronti (products_import_ready_candidates).
 * Usage: npm run report:boss-products:ready
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const REPORT_PATH = join(
  REPO_ROOT,
  "data/imports/products-boss/products-ready-candidates-report.json",
);
const TOP_N = 25;

type ReadyRow = {
  canonical_name: string;
  usage_type: string;
  product_category: string;
  canonical_strategy: string;
  salons_present: number[];
  total_qty: number;
  avg_price: number | null;
  avg_cost: number | null;
  source_names: string[];
  source_salons: string[];
  raw_rows_count: number;
  source_name_keys: string[];
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

function estimatedValue(row: ReadyRow): number {
  return Number(row.total_qty) * Number(row.avg_price ?? 0);
}

async function fetchAllReady(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<ReadyRow[]> {
  const pageSize = 500;
  const rows: ReadyRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_ready_candidates")
      .select(
        "canonical_name, usage_type, product_category, canonical_strategy, salons_present, total_qty, avg_price, avg_cost, source_names, source_salons, raw_rows_count, source_name_keys",
      )
      .order("canonical_name")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_ready_candidates: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ReadyRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function topBy(
  rows: ReadyRow[],
  filter: (r: ReadyRow) => boolean,
  sort: (a: ReadyRow, b: ReadyRow) => number,
  limit: number,
) {
  return [...rows]
    .filter(filter)
    .sort(sort)
    .slice(0, limit)
    .map((r) => ({
      canonicalName: r.canonical_name,
      strategy: r.canonical_strategy,
      usageType: r.usage_type,
      category: r.product_category,
      totalQty: Number(r.total_qty),
      estimatedValue: Math.round(estimatedValue(r) * 100) / 100,
      salons: r.salons_present?.length ?? 0,
    }));
}

async function runReportProductsReadyCandidates(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const [ready, manualRes, excludedRes] = await Promise.all([
    fetchAllReady(supabase),
    supabase.from("products_import_manual_review").select("suggested_action"),
    supabase
      .from("products_import_manual_review")
      .select("*", { count: "exact", head: true })
      .eq("suggested_action", "exclude"),
  ]);

  if (manualRes.error) throw new Error(manualRes.error.message);

  const manual = manualRes.data ?? [];
  const strategyCounts = {
    merge_generic: ready.filter((r) => r.canonical_strategy === "merge_generic").length,
    keep_exact: ready.filter((r) => r.canonical_strategy === "keep_exact").length,
    import: ready.filter((r) => r.canonical_strategy === "import").length,
  };

  const manualByAction = new Map<string, number>();
  for (const m of manual as { suggested_action: string }[]) {
    manualByAction.set(m.suggested_action, (manualByAction.get(m.suggested_action) ?? 0) + 1);
  }

  const excludedExplicit = excludedRes.count ?? manualByAction.get("exclude") ?? 0;
  const pendingOrEmpty =
    (manualByAction.get("pending") ?? 0) + (manualByAction.get("") ?? 0);

  const totalQty = ready.reduce((s, r) => s + Number(r.total_qty), 0);
  const totalValue = ready.reduce((s, r) => s + estimatedValue(r), 0);
  const uniqueSourceKeys = new Set(ready.flatMap((r) => r.source_name_keys ?? []));

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      readyCandidates: ready.length,
      uniqueSourceNameKeys: uniqueSourceKeys.size,
      manualReviewRows: manual.length,
      excludedExplicit,
      pendingOrEmpty,
      totalQty,
      totalEstimatedValue: Math.round(totalValue * 100) / 100,
    },
    canonicalStrategyCounts: strategyCounts,
    masterCatalogEstimate: {
      readyCatalogRows: ready.length,
      description:
        "Righe nella view ready = prodotti master (merge_generic unifica per manual_canonical_name)",
      sourceProductsReviewed: uniqueSourceKeys.size,
    },
    topRetail: topBy(
      ready,
      (r) => r.usage_type === "retail",
      (a, b) => Number(b.total_qty) - Number(a.total_qty),
      TOP_N,
    ),
    topSalonUse: topBy(
      ready,
      (r) => r.usage_type === "salon_use",
      (a, b) => Number(b.total_qty) - Number(a.total_qty),
      TOP_N,
    ),
    topErbe: topBy(
      ready,
      (r) => r.product_category === "erbe",
      (a, b) => Number(b.total_qty) - Number(a.total_qty),
      TOP_N,
    ),
    topColori: topBy(
      ready,
      (r) => r.product_category === "colori",
      (a, b) => Number(b.total_qty) - Number(a.total_qty),
      TOP_N,
    ),
    topConsumabili: topBy(
      ready,
      (r) => r.product_category === "consumabili",
      (a, b) => Number(b.total_qty) - Number(a.total_qty),
      TOP_N,
    ),
    topMergeGeneric: topBy(
      ready,
      (r) => r.canonical_strategy === "merge_generic",
      (a, b) => Number(b.total_qty) - Number(a.total_qty),
      TOP_N,
    ),
    excludedSummary: {
      count: excludedExplicit,
      note: "suggested_action=exclude in manual_review; non compaiono in ready view",
    },
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Report ready candidates prodotti Boss ===\n");
  console.log(`Candidati ready (catalogo master): ${ready.length}`);
  console.log(`  merge_generic: ${strategyCounts.merge_generic}`);
  console.log(`  keep_exact: ${strategyCounts.keep_exact}`);
  console.log(`  import: ${strategyCounts.import}`);
  console.log(`Esclusi (exclude): ${excludedExplicit}`);
  console.log(`Pending/vuoti in review: ${pendingOrEmpty}`);
  console.log(`Prodotti sorgente (name_normalized): ${uniqueSourceKeys.size}`);
  console.log(`Qty totale ready: ${totalQty}`);
  console.log(`Valore stimato totale: €${totalValue.toFixed(2)}`);
  console.log(`\nStima catalogo master finale: ${ready.length} righe`);
  console.log(`\nReport JSON: ${REPORT_PATH}`);
  console.log("\npublic.products / product_stock NON modificati.");
}

runReportProductsReadyCandidates().catch((error: unknown) => {
  console.error("Report fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
