/**
 * Carica export Boss MAG002 in public.products_import_raw (staging).
 * NON scrive su public.products / product_stock / stock_movements.
 *
 * Usage:
 *   npm run import:boss-products:raw
 *   npm run import:boss-products:raw -- --dry-run
 *   npm run import:boss-products:raw -- --commit
 *   npm run import:boss-products:raw -- --commit --reset
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  BOSS_PRODUCTS_SOURCE,
  BOSS_PRODUCT_SALONS,
  type BossProductSalon,
  type ParsedBossProductRow,
  parseBossProductXlsFile,
  resolveBossProductFilePath,
} from "./bossProductsXlsParse.ts";

const REPO_ROOT = process.cwd();
const BATCH_SIZE = 400;

type StagingInsertRow = {
  source: string;
  source_file: string;
  source_salon_name: string;
  source_salon_id: number;
  source_row_number: number;
  raw: Record<string, string | number | null>;
  name_raw: string | null;
  name_normalized: string | null;
  category_raw: string | null;
  category_normalized: string | null;
  qty_raw: string | null;
  qty: number | null;
  price_raw: string | null;
  price: number | null;
  cost_raw: string | null;
  cost: number | null;
  import_status: string;
  import_warnings: string[];
};

type SalonSummary = {
  salonId: number;
  salonName: string;
  file: string;
  parsedRows: number;
  wouldInsert: number;
  inserted: number;
  qtyTotal: number;
  estimatedValue: number;
  warningsCount: number;
  topCategories: { category: string; count: number }[];
  formatError: string | null;
};

function parseArgs(argv: string[]): { dryRun: boolean; reset: boolean } {
  const commit = argv.includes("--commit");
  const reset = argv.includes("--reset");
  if (reset && !commit) {
    console.error("--reset richiede --commit");
    process.exit(1);
  }
  return { dryRun: !commit, reset };
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

function toStagingRow(
  salon: BossProductSalon,
  parsed: ParsedBossProductRow,
  resolvedSourceFile: string,
): StagingInsertRow {
  return {
    source: BOSS_PRODUCTS_SOURCE,
    source_file: resolvedSourceFile,
    source_salon_name: salon.name,
    source_salon_id: salon.id,
    source_row_number: parsed.sourceRowNumber,
    raw: parsed.raw,
    name_raw: parsed.nameRaw || null,
    name_normalized: parsed.nameNormalized || null,
    category_raw: parsed.categoryRaw,
    category_normalized: parsed.categoryNormalized,
    qty_raw: parsed.qtyRaw,
    qty: parsed.qty,
    price_raw: parsed.priceRaw,
    price: parsed.price,
    cost_raw: parsed.costRaw,
    cost: parsed.cost,
    import_status: "raw",
    import_warnings: parsed.importWarnings,
  };
}

function summarizeSalon(
  salon: BossProductSalon,
  rows: ParsedBossProductRow[],
  formatError: string | null,
  inserted: number,
): SalonSummary {
  const categoryCounts = new Map<string, number>();
  let qtyTotal = 0;
  let estimatedValue = 0;
  let warningsCount = 0;

  for (const r of rows) {
    if (r.importWarnings.length > 0) warningsCount++;
    if (r.qty !== null) qtyTotal += r.qty;
    if (r.qty !== null && r.price !== null) estimatedValue += r.qty * r.price;
  }

  for (const r of rows) {
    const cat = r.categoryNormalized || "(senza categoria)";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, count]) => ({ category, count }));

  return {
    salonId: salon.id,
    salonName: salon.name,
    file: salon.fileName,
    parsedRows: rows.length,
    wouldInsert: rows.length,
    inserted,
    qtyTotal,
    estimatedValue,
    warningsCount,
    topCategories,
    formatError,
  };
}

async function runLoadBossProductsRaw(): Promise<void> {
  const { dryRun, reset } = parseArgs(process.argv.slice(2));

  const allStaging: StagingInsertRow[] = [];
  const summaries: SalonSummary[] = [];
  const filesRead: string[] = [];

  for (const salon of BOSS_PRODUCT_SALONS) {
    const absolutePath = resolveBossProductFilePath(REPO_ROOT, salon);
    if (!absolutePath) {
      console.error(
        `File non trovato per ${salon.name}: atteso ${salon.fileName} (o "${salon.fileName.replace(/\.xls$/i, " .xls")}") in data/imports/products-boss/`,
      );
      process.exit(1);
    }

    filesRead.push(absolutePath.split("/").pop() ?? salon.fileName);
    const parsedFile = parseBossProductXlsFile(absolutePath, salon);

    if (parsedFile.formatError) {
      summaries.push(
        summarizeSalon(salon, [], parsedFile.formatError, 0),
      );
      console.error(
        `Formato non valido per ${salon.fileName}: ${parsedFile.formatError} (atteso MAG002 inventory)`,
      );
      process.exit(1);
    }

    const sourceFileRel = `data/imports/products-boss/${basename(absolutePath)}`;
    const staging = parsedFile.rows.map((r) => toStagingRow(salon, r, sourceFileRel));
    allStaging.push(...staging);
    summaries.push(summarizeSalon(salon, parsedFile.rows, null, 0));
  }

  const totalWarnings = allStaging.filter((r) => r.import_warnings.length > 0).length;

  console.log("=== Import Boss → products_import_raw ===\n");
  console.log(
    `Modalità: ${dryRun ? "DRY-RUN (nessuna scrittura DB)" : "COMMIT (scrittura staging)"}`,
  );
  if (reset) console.log("Reset: SVUOTA staging boss prima del caricamento");
  console.log(`File letti: ${filesRead.length}`);
  console.log(`Righe parse (inseribili): ${allStaging.length}`);
  console.log(`Would insert: ${allStaging.length}`);
  console.log(`Record con almeno un warning: ${totalWarnings}\n`);

  for (const s of summaries) {
    console.log(`--- ${s.salonName} (id=${s.salonId}) — ${s.file} ---`);
    if (s.formatError) {
      console.log(`  ERRORE formato: ${s.formatError}`);
      continue;
    }
    console.log(`  Prodotti: ${s.parsedRows}`);
    console.log(`  Giacenza totale (somma qty): ${s.qtyTotal}`);
    console.log(
      `  Valore stimato (qty × prezzo vendita): €${s.estimatedValue.toFixed(2)}`,
    );
    console.log(`  Warnings (record): ${s.warningsCount}`);
    console.log(
      `  Top categorie: ${s.topCategories.map((c) => `${c.category} (${c.count})`).join(", ") || "-"}`,
    );
  }

  if (dryRun) {
    console.log("\nDry-run completato. Nessuna modifica al database.");
    console.log("Per import reale: npm run import:boss-products:raw -- --commit");
    process.exit(0);
  }

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const { count: existingCount, error: countError } = await supabase
    .from("products_import_raw")
    .select("*", { count: "exact", head: true })
    .eq("source", BOSS_PRODUCTS_SOURCE);

  if (countError) {
    console.error("Verifica staging fallita:", countError.message);
    console.error("Hai eseguito supabase db push per la migration products_import_raw?");
    process.exit(1);
  }

  if ((existingCount ?? 0) > 0 && !reset) {
    console.error(
      `\nStaging già popolata (${existingCount} righe source=boss). Usa --commit --reset per svuotare e ricaricare.`,
    );
    process.exit(1);
  }

  if (reset) {
    const { error: deleteError } = await supabase
      .from("products_import_raw")
      .delete()
      .eq("source", BOSS_PRODUCTS_SOURCE);

    if (deleteError) {
      console.error("Reset staging fallito:", deleteError.message);
      process.exit(1);
    }
    console.log("\nStaging boss prodotti resettata.");
  }

  let inserted = 0;

  for (let i = 0; i < allStaging.length; i += BATCH_SIZE) {
    const batch = allStaging.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("products_import_raw").insert(batch);

    if (error) {
      if (error.code === "23505" && !reset) {
        console.error(
          "\nConflitto unique (source, source_salon_id, source_row_number). Usa --commit --reset.",
        );
        process.exit(1);
      }
      console.error(`Insert batch ${Math.floor(i / BATCH_SIZE) + 1} fallito:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    process.stdout.write(`\rInseriti: ${inserted}/${allStaging.length}`);
  }

  for (const s of summaries) {
    s.inserted = s.wouldInsert;
  }

  console.log("\n\n--- Riepilogo commit ---");
  console.log(`Files letti: ${filesRead.length}`);
  console.log(`Righe parse: ${allStaging.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Warnings (record con ≥1): ${totalWarnings}`);

  for (const s of summaries) {
    console.log(
      `  ${s.salonName}: ${s.inserted} righe, qty tot ${s.qtyTotal}, valore stimato €${s.estimatedValue.toFixed(2)}`,
    );
  }

  console.log(
    "\nTabella: public.products_import_raw (products/product_stock NON modificati)",
  );
}

runLoadBossProductsRaw().catch((error: unknown) => {
  console.error("Import fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
