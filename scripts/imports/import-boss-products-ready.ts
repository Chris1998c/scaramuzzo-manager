/**
 * Import catalogo: products_import_ready_candidates → public.products
 * Default: dry-run. Scrittura solo con --commit.
 * NON tocca product_stock / stock_movements.
 *
 * Usage:
 *   npm run import:boss-products:ready
 *   npm run import:boss-products:ready -- --commit --limit 10
 *   npm run import:boss-products:ready -- --commit
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const PAGE_SIZE = 500;
const SOURCE = "boss";

const FALLBACK_PRODUCTS_INSERT_COLUMNS = [
  "name",
  "category",
  "price",
  "cost",
  "active",
  "description",
] as const;

const PRODUCTS_DB_MANAGED_COLUMNS = new Set(["id", "created_at"]);

/** Mapping documentato (solo colonne verificate su schema remoto). */
const PRODUCTS_MAPPING = {
  name: "products.name (NOT NULL) ← canonical_name",
  category: "products.category ← product_category",
  price: "products.price ← avg_price",
  cost: "products.cost ← avg_cost",
  active: "products.active = true (se colonna esiste)",
  visible_in_cash:
    "true solo se usage_type retail|dual_use e colonna esiste; altrimenti omesso",
  visible_in_agenda: "false se colonna esiste; altrimenti omesso",
  description: "products.description ← metadati import Boss (usage, strategy, saloni)",
  not_mapped: [
    "sku",
    "barcode",
    "unit (default DB pz)",
    "vat_rate (default DB 22)",
    "type",
    "low_stock",
  ],
} as const;

type ReadyCandidate = {
  canonical_name: string;
  usage_type: string;
  product_category: string;
  canonical_strategy: string;
  avg_price: number | null;
  avg_cost: number | null;
  source_name_keys: string[] | null;
  source_salons: string[] | null;
  total_qty: number;
};

type ProductInsertRow = {
  name: string;
  category?: string | null;
  price?: number | null;
  cost?: number | null;
  active?: boolean;
  visible_in_cash?: boolean;
  visible_in_agenda?: boolean;
  description?: string | null;
};

type ProcessOutcome =
  | "would_insert"
  | "inserted"
  | "skipped_existing"
  | "skipped_empty_name"
  | "skipped_already_imported"
  | "error";

type SampleAction = {
  canonicalName: string;
  outcome: ProcessOutcome;
  detail?: string;
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

function parseArgs(argv: string[]): { commit: boolean; limit: number | null } {
  const commit = argv.includes("--commit");
  let limit: number | null = null;
  const idx = argv.indexOf("--limit");
  if (idx >= 0 && argv[idx + 1]) {
    const n = Number(argv[idx + 1]);
    if (!Number.isFinite(n) || n < 1) {
      console.error("--limit richiede un intero positivo");
      process.exit(1);
    }
    limit = Math.floor(n);
  }
  return { commit, limit };
}

function normalizeProductNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,;:'"()[\]/\\!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveProductsInsertColumns(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await supabase.from("products").select("*").limit(1);
  if (error) {
    console.warn(`Probe colonne products fallito (${error.message}); uso fallback schema.`);
    return new Set(FALLBACK_PRODUCTS_INSERT_COLUMNS);
  }

  const sample = data?.[0];
  if (!sample || typeof sample !== "object") {
    return new Set(FALLBACK_PRODUCTS_INSERT_COLUMNS);
  }

  return new Set(
    Object.keys(sample).filter((key) => !PRODUCTS_DB_MANAGED_COLUMNS.has(key)),
  );
}

async function loadExistingProductNameKeys(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const byKey = new Map<string, number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Lettura products: ${error.message}`);
    if (!data?.length) break;

    for (const row of data as { id: number; name: string }[]) {
      const key = normalizeProductNameKey(String(row.name ?? ""));
      if (key && !byKey.has(key)) byKey.set(key, row.id);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return byKey;
}

async function loadImportedSourceKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_raw")
      .select("name_normalized")
      .eq("source", SOURCE)
      .eq("import_status", "imported")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Lettura staging imported: ${error.message}`);
    if (!data?.length) break;

    for (const row of data as { name_normalized: string }[]) {
      if (row.name_normalized) keys.add(row.name_normalized);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return keys;
}

async function fetchReadyCandidates(
  supabase: SupabaseClient,
  limit: number | null,
): Promise<ReadyCandidate[]> {
  const all: ReadyCandidate[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_ready_candidates")
      .select(
        "canonical_name, usage_type, product_category, canonical_strategy, avg_price, avg_cost, source_name_keys, source_salons, total_qty",
      )
      .order("canonical_name")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`products_import_ready_candidates: ${error.message}`);
    if (!data?.length) break;

    all.push(...(data as ReadyCandidate[]));
    if (limit !== null && all.length >= limit) return all.slice(0, limit);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return limit !== null ? all.slice(0, limit) : all;
}

function buildDescription(candidate: ReadyCandidate): string {
  const salons = (candidate.source_salons ?? []).join(", ");
  return [
    "Import Boss",
    `usage_type: ${candidate.usage_type}`,
    `strategy: ${candidate.canonical_strategy}`,
    `qty staging totale: ${candidate.total_qty}`,
    salons ? `saloni: ${salons}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function usageAllowsCashRegister(usageType: string): boolean {
  const u = usageType.trim().toLowerCase();
  return u === "retail" || u === "dual_use";
}

function toInsertRow(
  candidate: ReadyCandidate,
  allowed: Set<string>,
): ProductInsertRow | null {
  const name = candidate.canonical_name?.trim();
  if (!name) return null;

  const price =
    candidate.avg_price !== null && Number.isFinite(Number(candidate.avg_price))
      ? Number(candidate.avg_price)
      : 0;
  const cost =
    candidate.avg_cost !== null && Number.isFinite(Number(candidate.avg_cost))
      ? Number(candidate.avg_cost)
      : null;

  const row: ProductInsertRow = {
    name,
    category: candidate.product_category?.trim() || null,
    price,
    cost,
    description: buildDescription(candidate),
  };

  if (allowed.has("active")) row.active = true;
  if (allowed.has("visible_in_cash") && usageAllowsCashRegister(candidate.usage_type ?? "")) {
    row.visible_in_cash = true;
  }
  if (allowed.has("visible_in_agenda")) row.visible_in_agenda = false;

  return row;
}

function validateInsertPayload(
  row: ProductInsertRow,
  allowed: Set<string>,
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  const unknown = Object.keys(row).filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    return { ok: false, reason: `campi non su products: ${unknown.join(", ")}` };
  }

  const payload: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in row)) continue;
    const v = row[key as keyof ProductInsertRow];
    if (v === undefined) continue;
    payload[key] = v;
  }

  if (!String(payload.name ?? "").trim()) {
    return { ok: false, reason: "name vuoto" };
  }

  return { ok: true, payload };
}

async function insertProduct(
  supabase: SupabaseClient,
  row: ProductInsertRow,
  allowed: Set<string>,
): Promise<{ id: number | null; error: string | null }> {
  const validated = validateInsertPayload(row, allowed);
  if (!validated.ok) return { id: null, error: validated.reason };

  const { data, error } = await supabase
    .from("products")
    .insert(validated.payload)
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  const id = Number(data?.id);
  if (!Number.isFinite(id)) return { id: null, error: "Insert senza id" };
  return { id, error: null };
}

async function markStagingImported(
  supabase: SupabaseClient,
  sourceNameKeys: string[],
  productId: number,
): Promise<string | null> {
  if (sourceNameKeys.length === 0) return "source_name_keys vuoto";

  const { error } = await supabase
    .from("products_import_raw")
    .update({
      import_status: "imported",
      imported_product_id: productId,
    })
    .eq("source", SOURCE)
    .in("name_normalized", sourceNameKeys);

  return error ? error.message : null;
}

function classifyCandidate(
  candidate: ReadyCandidate,
  existingByName: Map<string, number>,
  importedKeys: Set<string>,
): { outcome: ProcessOutcome; detail?: string } {
  const name = candidate.canonical_name?.trim();
  if (!name) return { outcome: "skipped_empty_name" };

  const keys = candidate.source_name_keys ?? [];
  if (keys.some((k) => importedKeys.has(k))) {
    return { outcome: "skipped_already_imported" };
  }

  const norm = normalizeProductNameKey(name);
  if (existingByName.has(norm)) {
    return {
      outcome: "skipped_existing",
      detail: `products.id=${existingByName.get(norm)}`,
    };
  }

  return { outcome: "would_insert" };
}

async function runImportBossProductsReady(): Promise<void> {
  const { commit, limit } = parseArgs(process.argv.slice(2));
  const dryRun = !commit;

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  console.log("=== Import Boss ready → products ===\n");
  console.log(`Modalità: ${dryRun ? "DRY-RUN (nessuna scrittura)" : "COMMIT"}`);
  if (limit !== null) console.log(`Limit: ${limit} candidati`);
  console.log("\nMapping public.products (schema remoto):");
  console.log(JSON.stringify(PRODUCTS_MAPPING, null, 2));

  const [candidates, existingByName, importedKeys, allowedColumns] = await Promise.all([
    fetchReadyCandidates(supabase, limit),
    loadExistingProductNameKeys(supabase),
    loadImportedSourceKeys(supabase),
    resolveProductsInsertColumns(supabase),
  ]);

  if (!allowedColumns.has("name")) {
    console.error("Schema products: colonna name obbligatoria assente.");
    process.exit(1);
  }

  console.log(
    `\nColonne insert ammesse (probe): ${[...allowedColumns].sort().join(", ")}`,
  );

  const summary = {
    candidatesRead: candidates.length,
    wouldInsert: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedEmptyName: 0,
    skippedAlreadyImported: 0,
    errors: 0,
  };

  const samples: SampleAction[] = [];
  const maxSamples = 15;

  for (const candidate of candidates) {
    const { outcome, detail } = classifyCandidate(candidate, existingByName, importedKeys);

    switch (outcome) {
      case "would_insert":
        if (dryRun) summary.wouldInsert++;
        break;
      case "skipped_existing":
        summary.skippedExisting++;
        break;
      case "skipped_empty_name":
        summary.skippedEmptyName++;
        break;
      case "skipped_already_imported":
        summary.skippedAlreadyImported++;
        break;
      default:
        break;
    }

    if (samples.length < maxSamples) {
      samples.push({
        canonicalName: candidate.canonical_name?.slice(0, 80) ?? "(vuoto)",
        outcome,
        detail,
      });
    }

    if (dryRun || outcome !== "would_insert") continue;

    const row = toInsertRow(candidate, allowedColumns);
    if (!row) {
      summary.errors++;
      continue;
    }

    const { id: productId, error: insertError } = await insertProduct(
      supabase,
      row,
      allowedColumns,
    );
    if (insertError || productId === null) {
      summary.errors++;
      continue;
    }

    const stagingKeys = candidate.source_name_keys ?? [];
    const markError = await markStagingImported(supabase, stagingKeys, productId);
    if (markError) {
      summary.errors++;
      continue;
    }

    summary.inserted++;
    existingByName.set(normalizeProductNameKey(row.name), productId);
    for (const k of stagingKeys) importedKeys.add(k);

    if (summary.inserted % 50 === 0) {
      process.stdout.write(`\rInseriti: ${summary.inserted}`);
    }
  }

  if (commit && summary.inserted > 0) process.stdout.write("\n");

  console.log("\n--- Riepilogo ---");
  console.log(`Candidates letti: ${summary.candidatesRead}`);
  if (dryRun) {
    console.log(`Would insert: ${summary.wouldInsert}`);
  } else {
    console.log(`Inserted: ${summary.inserted}`);
  }
  console.log(`Skipped existing (nome già in products): ${summary.skippedExisting}`);
  console.log(`Skipped empty name: ${summary.skippedEmptyName}`);
  console.log(`Skipped già imported in staging: ${summary.skippedAlreadyImported}`);
  console.log(`Errors: ${summary.errors}`);

  console.log("\n--- Sample ---");
  for (const s of samples) {
    const extra = s.detail ? ` — ${s.detail}` : "";
    console.log(`  ${s.canonicalName} → ${s.outcome}${extra}`);
  }

  if (dryRun) {
    console.log("\nNessuna modifica a products / product_stock / staging.");
    console.log("Test limitato: npm run import:boss-products:ready -- --commit --limit 10");
    console.log("Import completo: npm run import:boss-products:ready -- --commit");
  } else {
    console.log("\nStaging products_import_raw aggiornata (import_status=imported).");
    console.log("product_stock NON modificato.");
  }
}

runImportBossProductsReady().catch((error: unknown) => {
  console.error("Import fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
