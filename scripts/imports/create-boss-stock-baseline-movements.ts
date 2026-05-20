/**
 * Baseline stock_movements per giacenze Boss già in product_stock.
 * SOLO insert log — NON chiama stock_move, NON modifica product_stock.
 *
 * Usage:
 *   npm run baseline:boss-stock-movements
 *   npm run baseline:boss-stock-movements -- --dry-run
 *   npm run baseline:boss-stock-movements -- --commit
 *   npm run baseline:boss-stock-movements -- --dry-run --limit 20
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const PAGE_SIZE = 1000;
const BASELINE_REASON = "boss_import_baseline";
const BASELINE_MOVEMENT_TYPE = "load";
/** Data documentata import Boss (timestamp without time zone in DB). */
const BASELINE_CREATED_AT = "2026-05-19T00:00:00";
const BASELINE_NAMESPACE_UUID = "a1b2c3d4-e5f6-4789-a012-000000000001";
const INSERT_BATCH = 100;
const TOP_SAMPLES = 20;

const FALLBACK_INSERT_COLUMNS = [
  "product_id",
  "from_salon",
  "to_salon",
  "quantity",
  "movement_type",
  "reason",
] as const;

const DB_MANAGED_COLUMNS = new Set(["id"]);

type StockRow = {
  product_id: number;
  salon_id: number;
  quantity: number;
};

type BaselineCandidate = {
  product_id: number;
  salon_id: number;
  quantity: number;
  product_name: string;
  salon_name: string;
  client_request_id: string;
};

type SalonBucket = {
  candidates: number;
  would_insert: number;
  inserted: number;
  baseline_qty_sum: number;
};

function pairKey(productId: number, salonId: number): string {
  return `${productId}:${salonId}`;
}

function parseNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

function createSupabaseAdmin(): SupabaseClient {
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
  const dryRunFlag = argv.includes("--dry-run");
  const commitFlag = argv.includes("--commit");
  const commit = commitFlag && !dryRunFlag;

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

/** UUID v5 deterministico per idempotenza client_request_id (unique parziale DB). */
function baselineClientRequestId(productId: number, salonId: number): string {
  const name = `boss_import_baseline:${productId}:${salonId}`;
  const namespaceBytes = Buffer.from(BASELINE_NAMESPACE_UUID.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(namespaceBytes)
    .update(name)
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

async function fetchAll<T>(
  label: string,
  fetchPage: (offset: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await fetchPage(offset);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function resolveInsertColumns(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("stock_movements").select("*").limit(1);
  if (error) {
    console.warn(`Probe stock_movements fallito (${error.message}); uso fallback colonne.`);
    return new Set(FALLBACK_INSERT_COLUMNS);
  }
  const sample = data?.[0];
  if (!sample || typeof sample !== "object") {
    return new Set(FALLBACK_INSERT_COLUMNS);
  }
  return new Set(
    Object.keys(sample).filter((key) => !DB_MANAGED_COLUMNS.has(key)),
  );
}

async function loadExistingBaselinePairs(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const pairs = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("product_id, to_salon")
      .eq("reason", BASELINE_REASON)
      .eq("movement_type", BASELINE_MOVEMENT_TYPE)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`stock_movements baseline: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const productId = Number(row.product_id);
      const salonId = Number(row.to_salon);
      if (Number.isFinite(productId) && Number.isFinite(salonId)) {
        pairs.add(pairKey(productId, salonId));
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return pairs;
}

function buildInsertPayload(
  candidate: BaselineCandidate,
  allowed: Set<string>,
): Record<string, unknown> {
  const full: Record<string, unknown> = {
    product_id: candidate.product_id,
    from_salon: null,
    to_salon: candidate.salon_id,
    quantity: candidate.quantity,
    movement_type: BASELINE_MOVEMENT_TYPE,
    reason: BASELINE_REASON,
    client_request_id: candidate.client_request_id,
    created_at: BASELINE_CREATED_AT,
  };

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(full)) {
    if (allowed.has(key)) payload[key] = value;
  }
  return payload;
}

async function runBaseline(): Promise<void> {
  const { commit, limit } = parseArgs(process.argv.slice(2));
  const dryRun = !commit;

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  console.log("=== Baseline movimenti Boss → stock_movements ===\n");
  console.log(`Modalità: ${dryRun ? "DRY-RUN (nessuna scrittura)" : "COMMIT"}`);
  console.log("product_stock: NON modificato");
  console.log("stock_move: NON chiamato (evita doppio stock)\n");
  console.log(
    JSON.stringify(
      {
        movement_type: BASELINE_MOVEMENT_TYPE,
        reason: BASELINE_REASON,
        from_salon: null,
        to_salon: "product_stock.salon_id",
        quantity: "product_stock.quantity (positiva, load)",
        created_at: BASELINE_CREATED_AT,
        client_request_id: "UUID v5 deterministico per product_id+salon_id",
      },
      null,
      2,
    ),
  );

  const [stockRows, products, salons, existingBaseline, allowedColumns] = await Promise.all([
    fetchAll<StockRow>("product_stock", async (offset) => {
      const r = await supabase
        .from("product_stock")
        .select("product_id, salon_id, quantity")
        .order("salon_id")
        .order("product_id")
        .range(offset, offset + PAGE_SIZE - 1);
      return {
        data: (r.data ?? []).map((row) => ({
          product_id: Number(row.product_id),
          salon_id: Number(row.salon_id),
          quantity: parseNum(row.quantity),
        })),
        error: r.error,
      };
    }),
    fetchAll<{ id: number; name: string }>("products", async (offset) => {
      const r = await supabase
        .from("products")
        .select("id, name")
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      return {
        data: (r.data ?? []).map((row) => ({
          id: Number(row.id),
          name: String(row.name ?? ""),
        })),
        error: r.error,
      };
    }),
    fetchAll<{ id: number; name: string }>("salons", async (offset) => {
      const r = await supabase
        .from("salons")
        .select("id, name")
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      return {
        data: (r.data ?? []).map((row) => ({
          id: Number(row.id),
          name: String(row.name ?? ""),
        })),
        error: r.error,
      };
    }),
    loadExistingBaselinePairs(supabase),
    resolveInsertColumns(supabase),
  ]);

  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const salonNameById = new Map(salons.map((s) => [s.id, s.name]));

  const required = ["product_id", "to_salon", "quantity", "movement_type", "reason"];
  const missing = required.filter((c) => !allowedColumns.has(c));
  if (missing.length > 0) {
    console.error(`Schema stock_movements incompleto: mancano ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `\nColonne insert ammesse (probe): ${[...allowedColumns].sort().join(", ")}`,
  );
  console.log(`Baseline già presenti (reason=${BASELINE_REASON}): ${existingBaseline.size}`);

  const summary = {
    product_stock_rows: stockRows.length,
    candidates: 0,
    would_insert: 0,
    inserted: 0,
    skipped_existing_baseline: 0,
    skipped_zero_qty: 0,
    errors: 0,
  };

  const bySalon = new Map<number, SalonBucket>();
  const toInsert: BaselineCandidate[] = [];

  for (const row of stockRows) {
    if (!Number.isFinite(row.product_id) || !Number.isFinite(row.salon_id)) continue;

    const bucket =
      bySalon.get(row.salon_id) ??
      ({
        candidates: 0,
        would_insert: 0,
        inserted: 0,
        baseline_qty_sum: 0,
      } satisfies SalonBucket);
    bySalon.set(row.salon_id, bucket);

    if (row.quantity <= 0) {
      summary.skipped_zero_qty++;
      continue;
    }

    const key = pairKey(row.product_id, row.salon_id);
    if (existingBaseline.has(key)) {
      summary.skipped_existing_baseline++;
      continue;
    }

    summary.candidates++;
    bucket.candidates++;

    const candidate: BaselineCandidate = {
      product_id: row.product_id,
      salon_id: row.salon_id,
      quantity: row.quantity,
      product_name: productNameById.get(row.product_id) ?? `Prodotto ${row.product_id}`,
      salon_name: salonNameById.get(row.salon_id) ?? `Salone ${row.salon_id}`,
      client_request_id: baselineClientRequestId(row.product_id, row.salon_id),
    };

    toInsert.push(candidate);
    bucket.would_insert++;
    bucket.baseline_qty_sum += row.quantity;
  }

  const batch = limit != null ? toInsert.slice(0, limit) : toInsert;
  summary.would_insert = batch.length;

  if (dryRun) {
    console.log("\n--- Riepilogo dry-run ---");
    console.log(`Righe product_stock: ${summary.product_stock_rows}`);
    console.log(`Candidati baseline (qty>0, senza baseline): ${summary.candidates}`);
    console.log(`Would insert: ${summary.would_insert}${limit != null ? ` (limit ${limit})` : ""}`);
    console.log(`Skipped baseline esistente: ${summary.skipped_existing_baseline}`);
    console.log(`Skipped qty <= 0: ${summary.skipped_zero_qty}`);

    console.log("\n--- Per salone (would insert) ---");
    for (const [salonId, b] of [...bySalon.entries()].sort((a, z) => a[0] - z[0])) {
      const name = salonNameById.get(salonId) ?? `Salone ${salonId}`;
      console.log(
        `  [${salonId}] ${name}: candidati=${b.candidates} would_insert=${limit != null ? Math.min(b.would_insert, b.candidates) : b.would_insert} qty_sum≈${b.baseline_qty_sum}`,
      );
    }

    const top = [...batch]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, TOP_SAMPLES);

    console.log(`\n--- Top ${Math.min(TOP_SAMPLES, top.length)} baseline (sample) ---`);
    for (const c of top) {
      console.log(
        `  ${c.salon_name} / ${c.product_name}: qty=${c.quantity} rid=${c.client_request_id}`,
      );
    }

    if (batch.length > 0) {
      const example = buildInsertPayload(batch[0]!, allowedColumns);
      console.log("\n--- Esempio riga stock_movements (payload insert) ---");
      console.log(JSON.stringify(example, null, 2));
    }

    console.log("\nNessuna modifica a product_stock / sales / transfers.");
    console.log("Per applicare: npm run baseline:boss-stock-movements -- --commit");
    if (limit != null) {
      console.log(`Senza limit: ${summary.candidates} movimenti totali.`);
    }
    return;
  }

  // COMMIT
  for (let i = 0; i < batch.length; i += INSERT_BATCH) {
    const chunk = batch.slice(i, i + INSERT_BATCH);
    const payloads = chunk.map((c) => buildInsertPayload(c, allowedColumns));

    const { error } = await supabase.from("stock_movements").insert(payloads);
    if (error) {
      if (error.code === "23505") {
        for (const c of chunk) {
          const { error: oneErr } = await supabase
            .from("stock_movements")
            .insert(buildInsertPayload(c, allowedColumns));
          if (oneErr) {
            summary.errors++;
            console.error(`Insert fallito ${pairKey(c.product_id, c.salon_id)}: ${oneErr.message}`);
          } else {
            summary.inserted++;
          }
        }
      } else {
        summary.errors += chunk.length;
        console.error(`Batch insert fallito: ${error.message}`);
      }
    } else {
      summary.inserted += chunk.length;
    }

    if (summary.inserted > 0 && summary.inserted % 100 === 0) {
      process.stdout.write(`\rInseriti: ${summary.inserted}`);
    }
  }

  if (summary.inserted > 0) process.stdout.write("\n");

  console.log("\n--- Riepilogo commit ---");
  console.log(`Inserted: ${summary.inserted}`);
  console.log(`Errors: ${summary.errors}`);
  console.log("product_stock: invariato (solo log stock_movements).");
  console.log("Verifica: npm run report:stock-reconciliation");
}

runBaseline().catch((err: unknown) => {
  console.error("Baseline fallita:", err instanceof Error ? err.message : err);
  process.exit(1);
});
