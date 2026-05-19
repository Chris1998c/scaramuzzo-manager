/**
 * Rigenera products-review-final.csv da products-review-priority.csv (solo regole auto).
 * Usage: npm run merge:boss-products-review
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { applyAutoReviewRules } from "./bossProductsReviewAutoRules.ts";
import { type ReviewCsvRow, readReviewCsv, writeReviewCsv } from "./bossProductsReviewCsv.ts";

const REPO_ROOT = process.cwd();
const DIR = join(REPO_ROOT, "data/imports/products-boss");
const PRIORITY_PATH = join(DIR, "products-review-priority.csv");
const OUTPUT_PATH = join(DIR, "products-review-final.csv");

function applyRulesToRow(row: ReviewCsvRow): ReviewCsvRow {
  const out = { ...row };
  const result = applyAutoReviewRules(row);

  if (result) {
    out.suggested_action = result.suggested_action;
    out.manual_category = result.manual_category;
    out.manual_usage_type = result.manual_usage_type;
    out.notes = result.notes;
    if (!out.manual_canonical_name?.trim()) {
      out.manual_canonical_name = row.candidate_name;
    }
  } else {
    out.suggested_action = out.suggested_action?.trim() || "pending";
    out.manual_category = "";
    out.manual_usage_type = "";
    if (!out.notes?.trim()) out.notes = "Review manuale — nessuna regola auto";
  }

  return out;
}

function runMergeBossProductsReviewFinal(): void {
  if (!existsSync(PRIORITY_PATH)) {
    console.error(`Manca: ${PRIORITY_PATH}`);
    console.error("Esegui: npm run review:boss-products");
    process.exit(1);
  }

  const priorityRows = readReviewCsv(PRIORITY_PATH);
  const finalRows = priorityRows
    .map(applyRulesToRow)
    .sort((a, b) => a.name_normalized.localeCompare(b.name_normalized));

  mkdirSync(DIR, { recursive: true });
  writeReviewCsv(OUTPUT_PATH, finalRows);

  const stats = {
    import: 0,
    exclude: 0,
    keep_exact: 0,
    merge_generic: 0,
    pending: 0,
    other: 0,
  };
  const ruleHits = new Map<string, number>();

  let readyEligible = 0;
  for (const row of finalRows) {
    const a = (row.suggested_action ?? "").trim().toLowerCase() || "pending";
    if (a in stats) stats[a as keyof typeof stats]++;
    else stats.other++;

    if (
      ["import", "keep_exact", "merge_generic"].includes(a) &&
      row.manual_category?.trim() &&
      row.manual_usage_type?.trim() &&
      row.is_noise !== "true" &&
      Number(row.total_qty) > 0
    ) {
      readyEligible++;
    }

    const applied = applyAutoReviewRules(row);
    if (applied) ruleHits.set(applied.ruleId, (ruleHits.get(applied.ruleId) ?? 0) + 1);
  }

  console.log("=== Rigenera review finale prodotti Boss ===\n");
  console.log(`Sorgente: ${PRIORITY_PATH} (${priorityRows.length} righe)`);
  console.log(`Output: ${OUTPUT_PATH}`);
  console.log(`Stima ready (import/keep_exact + category + usage + qty): ${readyEligible}`);
  console.log("\nDistribuzione suggested_action:");
  console.log(`  keep_exact: ${stats.keep_exact}`);
  console.log(`  import: ${stats.import}`);
  console.log(`  exclude: ${stats.exclude}`);
  console.log(`  merge_generic: ${stats.merge_generic}`);
  console.log(`  pending: ${stats.pending}`);
  if (stats.other) console.log(`  altro: ${stats.other}`);

  console.log("\nTop regole applicate:");
  for (const [id, count] of [...ruleHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${id}: ${count}`);
  }
}

runMergeBossProductsReviewFinal();
