/**
 * Import giacenze iniziali: products_import_raw → public.product_stock
 * Default: dry-run. Scrittura solo con --commit.
 * NON crea stock_movements. NON modifica public.products.
 *
 * Usage:
 *   npm run import:boss-products:stock
 *   npm run import:boss-products:stock -- --dry-run
 *   npm run import:boss-products:stock -- --commit --limit 50
 *   npm run import:boss-products:stock -- --commit --overwrite
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const PAGE_SIZE = 1000;
const SOURCE = "boss";
const SALON_IDS = [1, 2, 3, 4, 5] as const;

const SALON_LABELS: Record<number, string> = {
  1: "Roma",
  2: "Corigliano",
  3: "Castrovillari",
  4: "Cosenza",
  5: "Magazzino Centrale",
};

const FALLBACK_STOCK_INSERT_COLUMNS = ["product_id", "salon_id", "quantity"] as const;
const STOCK_DB_MANAGED_COLUMNS = new Set(["id"]);

const STOCK_MAPPING = {
  product_id: "product_stock.product_id ← imported_product_id",
  salon_id: "product_stock.salon_id ← source_salon_id",
  quantity: "product_stock.quantity ← qty (aggregata per product_id+salon_id)",
  not_touched: ["stock_movements", "products", "sales/cassa"],
} as const;

type RawStockRow = {
  id: number;
  imported_product_id: number;
  source_salon_id: number;
  source_salon_name: string | null;
  qty: number;
};

type AggregatedStockLine = {
  product_id: number;
  salon_id: number;
  quantity: number;
  raw_row_ids: number[];
};

type ExistingStock = {
  id: number;
  quantity: number;
};

type SalonBucket = {
  wouldInsert: number;
  inserted: number;
  wouldUpdate: number;
  updated: number;
  skippedExisting: number;
  skippedZeroQty: number;
  errors: number;
};

type ProcessOutcome =
  | "would_insert"
  | "inserted"
  | "would_update"
  | "updated"
  | "skipped_existing"
  | "skipped_zero_qty"
  | "error";

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

function parseArgs(argv: string[]): {
  commit: boolean;
  overwrite: boolean;
  limit: number | null;
} {
  const commit = argv.includes("--commit");
  const overwrite = argv.includes("--overwrite");
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
  return { commit, overwrite, limit };
}

function stockKey(productId: number, salonId: number): string {
  return `${productId}:${salonId}`;
}

function emptySalonBucket(): SalonBucket {
  return {
    wouldInsert: 0,
    inserted: 0,
    wouldUpdate: 0,
    updated: 0,
    skippedExisting: 0,
    skippedZeroQty: 0,
    errors: 0,
  };
}

function bumpSalon(
  bySalon: Map<number, SalonBucket>,
  salonId: number,
  field: keyof SalonBucket,
): void {
  const b = bySalon.get(salonId) ?? emptySalonBucket();
  b[field]++;
  bySalon.set(salonId, b);
}

async function resolveStockInsertColumns(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("product_stock").select("*").limit(1);
  if (error) {
    console.warn(`Probe product_stock fallito (${error.message}); uso fallback.`);
    return new Set(FALLBACK_STOCK_INSERT_COLUMNS);
  }
  const sample = data?.[0];
  if (!sample || typeof sample !== "object") {
    return new Set(FALLBACK_STOCK_INSERT_COLUMNS);
  }
  return new Set(
    Object.keys(sample).filter((key) => !STOCK_DB_MANAGED_COLUMNS.has(key)),
  );
}

async function fetchRawStockRows(supabase: SupabaseClient): Promise<RawStockRow[]> {
  const all: RawStockRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_raw")
      .select("id, imported_product_id, source_salon_id, source_salon_name, qty")
      .eq("source", SOURCE)
      .not("imported_product_id", "is", null)
      .not("qty", "is", null)
      .in("source_salon_id", [...SALON_IDS])
      .order("source_salon_id")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`products_import_raw: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const productId = Number(row.imported_product_id);
      const salonId = Number(row.source_salon_id);
      const qty = Number(row.qty);
      if (!Number.isFinite(productId) || !Number.isFinite(salonId) || !Number.isFinite(qty)) {
        continue;
      }
      all.push({
        id: Number(row.id),
        imported_product_id: productId,
        source_salon_id: salonId,
        source_salon_name: row.source_salon_name as string | null,
        qty,
      });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

function aggregateStockLines(rawRows: RawStockRow[]): {
  lines: AggregatedStockLine[];
  skippedZeroQtyRaw: number;
} {
  const map = new Map<string, AggregatedStockLine>();
  let skippedZeroQtyRaw = 0;

  for (const row of rawRows) {
    if (row.qty <= 0) {
      skippedZeroQtyRaw++;
      continue;
    }

    const key = stockKey(row.imported_product_id, row.source_salon_id);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += row.qty;
      existing.raw_row_ids.push(row.id);
    } else {
      map.set(key, {
        product_id: row.imported_product_id,
        salon_id: row.source_salon_id,
        quantity: row.qty,
        raw_row_ids: [row.id],
      });
    }
  }

  const lines = [...map.values()].sort((a, b) => {
    if (a.salon_id !== b.salon_id) return a.salon_id - b.salon_id;
    return a.product_id - b.product_id;
  });

  return { lines, skippedZeroQtyRaw };
}

async function loadExistingStock(
  supabase: SupabaseClient,
): Promise<Map<string, ExistingStock>> {
  const byKey = new Map<string, ExistingStock>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("product_stock")
      .select("id, product_id, salon_id, quantity")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`product_stock: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const productId = Number(row.product_id);
      const salonId = Number(row.salon_id);
      if (!Number.isFinite(productId) || !Number.isFinite(salonId)) continue;
      byKey.set(stockKey(productId, salonId), {
        id: Number(row.id),
        quantity: Number(row.quantity ?? 0),
      });
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return byKey;
}

async function insertStock(
  supabase: SupabaseClient,
  line: AggregatedStockLine,
  allowed: Set<string>,
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    product_id: line.product_id,
    salon_id: line.salon_id,
    quantity: line.quantity,
  };
  const unknown = Object.keys(payload).filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    return `colonne non ammesse: ${unknown.join(", ")}`;
  }

  const { error } = await supabase.from("product_stock").insert(payload);
  return error ? error.message : null;
}

async function updateStockQuantity(
  supabase: SupabaseClient,
  stockId: number,
  quantity: number,
): Promise<string | null> {
  const { error } = await supabase
    .from("product_stock")
    .update({ quantity })
    .eq("id", stockId);
  return error ? error.message : null;
}

async function runImportBossProductStock(): Promise<void> {
  const { commit, overwrite, limit } = parseArgs(process.argv.slice(2));
  const dryRun = !commit;

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  console.log("=== Import Boss giacenze → product_stock ===\n");
  console.log(`Modalità: ${dryRun ? "DRY-RUN (nessuna scrittura)" : "COMMIT"}`);
  console.log(`Overwrite righe esistenti: ${overwrite ? "sì (--overwrite)" : "no (skip)"}`);
  if (limit !== null) console.log(`Limit: ${limit} righe aggregate (product×salon)`);

  console.log("\nMapping public.product_stock:");
  console.log(JSON.stringify(STOCK_MAPPING, null, 2));

  const [rawRows, existingStock, allowedColumns] = await Promise.all([
    fetchRawStockRows(supabase),
    loadExistingStock(supabase),
    resolveStockInsertColumns(supabase),
  ]);

  const required = ["product_id", "salon_id", "quantity"];
  const missing = required.filter((c) => !allowedColumns.has(c));
  if (missing.length > 0) {
    console.error(`Schema product_stock incompleto: mancano ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log(
    `\nColonne insert ammesse (probe): ${[...allowedColumns].sort().join(", ")}`,
  );
  console.log(
    "Vincolo unico: (product_id, salon_id). Qty aggregate se più righe raw stesso prodotto/salone.",
  );

  const { lines: allLines, skippedZeroQtyRaw } = aggregateStockLines(rawRows);
  const lines = limit !== null ? allLines.slice(0, limit) : allLines;

  const summary = {
    rowsRead: rawRows.length,
    aggregatedLines: lines.length,
    wouldInsert: 0,
    inserted: 0,
    wouldUpdate: 0,
    updated: 0,
    skippedExisting: 0,
    skippedZeroQty: skippedZeroQtyRaw,
    errors: 0,
  };

  const bySalon = new Map<number, SalonBucket>();
  for (const id of SALON_IDS) bySalon.set(id, emptySalonBucket());

  const samples: { outcome: ProcessOutcome; detail: string }[] = [];
  const maxSamples = 12;

  for (const line of lines) {
    const key = stockKey(line.product_id, line.salon_id);
    const existing = existingStock.get(key);
    let outcome: ProcessOutcome;

    if (existing) {
      if (dryRun) {
        outcome = "would_update";
        summary.wouldUpdate++;
        bumpSalon(bySalon, line.salon_id, "wouldUpdate");
      } else if (overwrite) {
        const err = await updateStockQuantity(supabase, existing.id, line.quantity);
        if (err) {
          outcome = "error";
          summary.errors++;
          bumpSalon(bySalon, line.salon_id, "errors");
        } else {
          outcome = "updated";
          summary.updated++;
          bumpSalon(bySalon, line.salon_id, "updated");
          existingStock.set(key, { id: existing.id, quantity: line.quantity });
        }
      } else {
        outcome = "skipped_existing";
        summary.skippedExisting++;
        bumpSalon(bySalon, line.salon_id, "skippedExisting");
      }
    } else if (dryRun) {
      outcome = "would_insert";
      summary.wouldInsert++;
      bumpSalon(bySalon, line.salon_id, "wouldInsert");
    } else {
      const err = await insertStock(supabase, line, allowedColumns);
      if (err) {
        outcome = "error";
        summary.errors++;
        bumpSalon(bySalon, line.salon_id, "errors");
      } else {
        outcome = "inserted";
        summary.inserted++;
        bumpSalon(bySalon, line.salon_id, "inserted");
        existingStock.set(key, { id: -1, quantity: line.quantity });
      }
    }

    if (samples.length < maxSamples) {
      const prev = existing?.quantity;
      samples.push({
        outcome,
        detail: `salon=${line.salon_id} product=${line.product_id} qty=${line.quantity}${prev !== undefined ? ` (era ${prev})` : ""} raw_rows=${line.raw_row_ids.length}`,
      });
    }

    if (summary.inserted > 0 && summary.inserted % 100 === 0) {
      process.stdout.write(`\rInseriti: ${summary.inserted}`);
    }
  }

  if (commit && summary.inserted > 0) process.stdout.write("\n");

  console.log("\n--- Riepilogo ---");
  console.log(`Righe raw lette (imported_product_id valorizzato): ${summary.rowsRead}`);
  console.log(`Righe aggregate product×salon: ${summary.aggregatedLines}`);
  if (dryRun) {
    console.log(`Would insert: ${summary.wouldInsert}`);
    console.log(`Would update: ${summary.wouldUpdate}`);
  } else {
    console.log(`Inserted: ${summary.inserted}`);
    console.log(`Updated: ${summary.updated}`);
  }
  console.log(`Skipped existing (senza --overwrite): ${summary.skippedExisting}`);
  console.log(`Skipped qty ≤ 0 (righe raw): ${summary.skippedZeroQty}`);
  console.log(`Errors: ${summary.errors}`);

  console.log("\n--- Per salone ---");
  for (const salonId of SALON_IDS) {
    const b = bySalon.get(salonId) ?? emptySalonBucket();
    const label = SALON_LABELS[salonId] ?? `Salon ${salonId}`;
    if (dryRun) {
      console.log(
        `  [${salonId}] ${label}: would_insert=${b.wouldInsert} would_update=${b.wouldUpdate} skipped_existing=${b.skippedExisting} errors=${b.errors}`,
      );
    } else {
      console.log(
        `  [${salonId}] ${label}: inserted=${b.inserted} updated=${b.updated} skipped_existing=${b.skippedExisting} errors=${b.errors}`,
      );
    }
  }

  console.log("\n--- Sample ---");
  for (const s of samples) {
    console.log(`  ${s.outcome} — ${s.detail}`);
  }

  if (dryRun) {
    console.log("\nNessuna modifica a product_stock / stock_movements / products.");
    console.log("Test: npm run import:boss-products:stock -- --commit --limit 50");
    console.log("Full: npm run import:boss-products:stock -- --commit");
    console.log("Sovrascrivi esistenti: aggiungi --overwrite");
  } else {
    console.log("\nproduct_stock aggiornato. stock_movements NON creati.");
  }
}

runImportBossProductStock().catch((error: unknown) => {
  console.error("Import fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
