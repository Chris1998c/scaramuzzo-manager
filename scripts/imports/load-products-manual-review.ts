/**
 * Carica review manuale da CSV prefilled → products_import_manual_review.
 * NON scrive su public.products.
 *
 * Usage:
 *   npm run import:boss-products:review
 *   npm run import:boss-products:review -- --commit
 *   npm run import:boss-products:review -- --commit --reset
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readReviewCsv } from "./bossProductsReviewCsv.ts";

const REPO_ROOT = process.cwd();
const INPUT_CSV = join(REPO_ROOT, "data/imports/products-boss/products-review-final.csv");
const BATCH_SIZE = 200;

type ManualReviewInsert = {
  name_normalized: string;
  suggested_action: string;
  manual_canonical_name: string | null;
  manual_category: string | null;
  manual_usage_type: string | null;
  notes: string | null;
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

function toInsert(row: ReturnType<typeof readReviewCsv>[0]): ManualReviewInsert {
  const action = row.suggested_action.trim() || "pending";
  return {
    name_normalized: row.name_normalized.trim(),
    suggested_action: action,
    manual_canonical_name: row.manual_canonical_name.trim() || null,
    manual_category: row.manual_category.trim() || null,
    manual_usage_type: row.manual_usage_type.trim() || null,
    notes: row.notes.trim() || null,
  };
}

async function runLoadProductsManualReview(): Promise<void> {
  const { dryRun, reset } = parseArgs(process.argv.slice(2));

  if (!existsSync(INPUT_CSV)) {
    console.error(`File non trovato: ${INPUT_CSV}`);
    console.error("Esegui: npm run merge:boss-products-review");
    process.exit(1);
  }

  const parsed = readReviewCsv(INPUT_CSV);
  const rows = parsed.map(toInsert);

  const byAction = new Map<string, number>();
  for (const r of rows) {
    byAction.set(r.suggested_action, (byAction.get(r.suggested_action) ?? 0) + 1);
  }

  console.log("=== Import review manuale → products_import_manual_review ===\n");
  console.log(`Modalità: ${dryRun ? "DRY-RUN" : "COMMIT"}`);
  if (reset) console.log("Reset: TRUNCATE manual_review");
  console.log(`Righe CSV: ${rows.length}`);
  console.log("Distribuzione suggested_action:");
  for (const [action, count] of [...byAction.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${action}: ${count}`);
  }

  if (dryRun) {
    console.log("\nDry-run completato. Nessuna modifica al database.");
    process.exit(0);
  }

  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  if (reset) {
    const { error: delError } = await supabase
      .from("products_import_manual_review")
      .delete()
      .neq("id", 0);

    if (delError) {
      console.error("Reset manual_review fallito:", delError.message);
      process.exit(1);
    }
    console.log("\nTabella products_import_manual_review svuotata.");
  } else {
    const { count, error: countError } = await supabase
      .from("products_import_manual_review")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("Verifica tabella fallita:", countError.message);
      console.error("Esegui supabase db push per la migration ready_candidates.");
      process.exit(1);
    }
    if ((count ?? 0) > 0) {
      console.error(
        `\nReview già presente (${count} righe). Usa --commit --reset per ricaricare.`,
      );
      process.exit(1);
    }
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("products_import_manual_review").insert(batch);

    if (error) {
      console.error(`Insert batch fallito:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\rInseriti: ${inserted}/${rows.length}`);
  }

  console.log(`\n\nInseriti: ${inserted}`);
  console.log("Tabella: public.products_import_manual_review");
  console.log("public.products / product_stock NON modificati.");
}

runLoadProductsManualReview().catch((error: unknown) => {
  console.error("Import review fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
