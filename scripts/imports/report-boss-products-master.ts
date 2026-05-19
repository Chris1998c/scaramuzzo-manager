/**
 * Report analisi catalogo master da products_import_raw (read-only).
 * Usage: npm run report:boss-products:master
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const REPORT_PATH = join(
  REPO_ROOT,
  "data/imports/products-boss/products-master-analysis-report.json",
);
const SOURCE = "boss";
const SALON_COUNT_FULL = 5;
const TOP_N = 30;
const MAX_SIMILAR = 50;
const MAX_NOISE = 50;

type MasterRow = {
  name_normalized: string;
  candidate_name: string;
  salons_count: number;
  salons_names: string[];
  total_rows: number;
  total_qty: number;
  categories: string[] | null;
  avg_price: number | null;
  avg_cost: number | null;
  has_zero_qty_everywhere: boolean;
  possible_internal_use: boolean;
  possible_retail: boolean;
  source_names: string[];
};

type SimilarRow = {
  candidate_a: string;
  candidate_b: string;
  salons_overlap: number;
  similarity_reason: string;
};

type NoiseRow = {
  name_normalized: string;
  candidate_name: string;
  noise_reasons: string[];
  total_rows: number;
  salons_count: number;
  total_qty: number;
  categories: string[] | null;
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

function estimatedValue(row: MasterRow): number {
  const price = row.avg_price ?? 0;
  return Number(row.total_qty) * Number(price);
}

async function fetchAllNoiseNames(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<Set<string>> {
  const pageSize = 1000;
  const names = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_noise_candidates")
      .select("name_normalized")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_noise_candidates: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as { name_normalized: string }[]) {
      names.add(row.name_normalized);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return names;
}

async function fetchAllMaster(supabase: ReturnType<typeof createSupabaseAdmin>): Promise<MasterRow[]> {
  const pageSize = 1000;
  const rows: MasterRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_master_candidates")
      .select(
        "name_normalized, candidate_name, salons_count, salons_names, total_rows, total_qty, categories, avg_price, avg_cost, has_zero_qty_everywhere, possible_internal_use, possible_retail, source_names",
      )
      .order("name_normalized")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_master_candidates: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as MasterRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function runBossProductsMasterReport(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const { count: stagingRows, error: stagingError } = await supabase
    .from("products_import_raw")
    .select("id", { count: "exact", head: true })
    .eq("source", SOURCE);

  if (stagingError) throw new Error(stagingError.message);

  const [
    master,
    noiseNameSet,
    similarRes,
    noiseRes,
    noiseCountRes,
    similarCountRes,
  ] = await Promise.all([
    fetchAllMaster(supabase),
    fetchAllNoiseNames(supabase),
    supabase
      .from("products_import_similar_candidates")
      .select("candidate_a, candidate_b, salons_overlap, similarity_reason")
      .order("salons_overlap", { ascending: false })
      .limit(MAX_SIMILAR),
    supabase
      .from("products_import_noise_candidates")
      .select(
        "name_normalized, candidate_name, noise_reasons, total_rows, salons_count, total_qty, categories",
      )
      .order("total_rows", { ascending: false })
      .limit(MAX_NOISE),
    supabase
      .from("products_import_noise_candidates")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("products_import_similar_candidates")
      .select("*", { count: "exact", head: true }),
  ]);

  if (similarRes.error) throw new Error(similarRes.error.message);
  if (noiseRes.error) throw new Error(noiseRes.error.message);
  if (noiseCountRes.error) throw new Error(noiseCountRes.error.message);
  if (similarCountRes.error) throw new Error(similarCountRes.error.message);

  const uniqueNormalized = master.length;
  const inAllSalons = master.filter((m) => m.salons_count >= SALON_COUNT_FULL);
  const noiseCount = noiseCountRes.count ?? noiseNameSet.size;

  const cleanCandidates = master.filter(
    (m) =>
      !noiseNameSet.has(m.name_normalized)
      && !m.has_zero_qty_everywhere
      && m.name_normalized.length >= 4,
  );

  const topAllSalons = [...inAllSalons]
    .sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
    .slice(0, TOP_N)
    .map((m) => ({
      name: m.candidate_name,
      nameNormalized: m.name_normalized,
      salonsCount: m.salons_count,
      totalQty: m.total_qty,
      avgPrice: m.avg_price,
      categories: m.categories,
    }));

  const topRetail = master
    .filter((m) => m.possible_retail && !noiseNameSet.has(m.name_normalized))
    .sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
    .slice(0, TOP_N)
    .map((m) => ({
      name: m.candidate_name,
      totalQty: m.total_qty,
      salonsCount: m.salons_count,
      categories: m.categories,
    }));

  const topInternal = master
    .filter((m) => m.possible_internal_use && !noiseNameSet.has(m.name_normalized))
    .sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
    .slice(0, TOP_N)
    .map((m) => ({
      name: m.candidate_name,
      totalQty: m.total_qty,
      salonsCount: m.salons_count,
    }));

  const topQty = [...master]
    .filter((m) => !noiseNameSet.has(m.name_normalized))
    .sort((a, b) => Number(b.total_qty) - Number(a.total_qty))
    .slice(0, TOP_N)
    .map((m) => ({
      name: m.candidate_name,
      totalQty: m.total_qty,
      salonsCount: m.salons_count,
    }));

  const topValue = [...master]
    .filter((m) => !noiseNameSet.has(m.name_normalized))
    .sort((a, b) => estimatedValue(b) - estimatedValue(a))
    .slice(0, TOP_N)
    .map((m) => ({
      name: m.candidate_name,
      estimatedValue: Math.round(estimatedValue(m) * 100) / 100,
      totalQty: m.total_qty,
      avgPrice: m.avg_price,
    }));

  const categoryCounts = new Map<string, number>();
  for (const m of cleanCandidates) {
    for (const cat of m.categories ?? []) {
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
  }

  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([category, productCount]) => ({ category, productCount }));

  const similarPairs = (similarRes.data as SimilarRow[] | null) ?? [];
  const noiseList = (noiseRes.data as NoiseRow[] | null) ?? [];

  const report = {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    totals: {
      stagingRows: stagingRows,
      uniqueNormalizedNames: uniqueNormalized,
      presentInAllFiveSalons: inAllSalons.length,
      noiseCandidates: noiseCount,
      similarPairs: similarCountRes.count ?? similarPairs.length,
    },
    masterCatalogEstimate: {
      uniqueNormalized,
      minusNoise: uniqueNormalized - noiseCount,
      cleanCatalogEstimate: cleanCandidates.length,
      description:
        "clean = name_normalized unici, esclusi noise view, qty non tutta zero, nome ≥ 4 char",
    },
    topPresentInAllSalons: topAllSalons,
    topRetail,
    topInternalUse: topInternal,
    topByQty: topQty,
    topByEstimatedValue: topValue,
    topCategories,
    noiseCandidates: noiseList,
    mergeSimilarCandidates: similarPairs,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Analisi catalogo master prodotti Boss ===\n");
  console.log(`Righe staging: ${stagingRows}`);
  console.log(`Nomi normalizzati unici: ${uniqueNormalized}`);
  console.log(`Presenti in tutti e 5 i saloni: ${inAllSalons.length}`);
  console.log(`Candidati rumore (view): ${noiseCount}`);
  console.log(`Coppie simili (view): ${similarCountRes.count ?? similarPairs.length}`);
  console.log(`Stima catalogo master pulito: ${cleanCandidates.length}`);
  console.log("\nTop categorie (candidati puliti):");
  for (const c of topCategories.slice(0, 8)) {
    console.log(`  ${c.category}: ${c.productCount} prodotti`);
  }
  console.log(`\nReport JSON: ${REPORT_PATH}`);
  console.log("\npublic.products / product_stock NON modificati.");
}

runBossProductsMasterReport().catch((error: unknown) => {
  console.error("Report fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
