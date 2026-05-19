/**
 * Esporta CSV prodotti pending (review non ancora approvata).
 * Usage: npm run review:boss-products:pending
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const OUT_CSV = join(REPO_ROOT, "data/imports/products-boss/products-review-pending.csv");

const CSV_COLUMNS = [
  "candidate_name",
  "name_normalized",
  "total_qty",
  "estimated_value",
  "categories",
  "source_names",
  "salons_count",
  "suggested_action",
  "manual_canonical_name",
  "manual_category",
  "manual_usage_type",
  "notes",
] as const;

type MasterRow = {
  name_normalized: string;
  candidate_name: string;
  salons_count: number;
  total_qty: number;
  categories: string[] | null;
  source_names: string[] | null;
  avg_price: number | null;
};

type ManualRow = {
  name_normalized: string;
  suggested_action: string;
  manual_canonical_name: string | null;
  manual_category: string | null;
  manual_usage_type: string | null;
  notes: string | null;
};

type PendingRow = {
  candidate_name: string;
  name_normalized: string;
  total_qty: number;
  estimated_value: number;
  categories: string;
  source_names: string;
  salons_count: number;
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

function isPendingAction(action: string | null | undefined): boolean {
  const a = (action ?? "").trim().toLowerCase();
  return a === "" || a === "pending";
}

function arrayCell(values: string[] | null): string {
  if (!values?.length) return "";
  return values.join(" | ");
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function estimatedValue(qty: number, avgPrice: number | null): number {
  return Math.round(Number(qty) * Number(avgPrice ?? 0) * 100) / 100;
}

async function fetchAllMaster(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<Map<string, MasterRow>> {
  const map = new Map<string, MasterRow>();
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_master_candidates")
      .select(
        "name_normalized, candidate_name, salons_count, total_qty, categories, source_names, avg_price",
      )
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_master_candidates: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as MasterRow[]) {
      map.set(row.name_normalized, row);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return map;
}

async function fetchAllManual(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<ManualRow[]> {
  const pageSize = 1000;
  const rows: ManualRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products_import_manual_review")
      .select(
        "name_normalized, suggested_action, manual_canonical_name, manual_category, manual_usage_type, notes",
      )
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`products_import_manual_review: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ManualRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function fetchNoiseNames(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<Set<string>> {
  const names = new Set<string>();
  const pageSize = 1000;
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

async function runReviewBossProductsPending(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const [masterByName, manualRows, noiseNames] = await Promise.all([
    fetchAllMaster(supabase),
    fetchAllManual(supabase),
    fetchNoiseNames(supabase),
  ]);

  const pending: PendingRow[] = [];

  for (const manual of manualRows) {
    if (!isPendingAction(manual.suggested_action)) continue;

    const master = masterByName.get(manual.name_normalized);
    if (!master) continue;
    if (noiseNames.has(manual.name_normalized)) continue;
    if (Number(master.total_qty) <= 0) continue;

    const ev = estimatedValue(Number(master.total_qty), master.avg_price);

    pending.push({
      candidate_name: master.candidate_name,
      name_normalized: manual.name_normalized,
      total_qty: Number(master.total_qty),
      estimated_value: ev,
      categories: arrayCell(master.categories),
      source_names: arrayCell(master.source_names),
      salons_count: master.salons_count,
      suggested_action: manual.suggested_action?.trim() ?? "",
      manual_canonical_name: manual.manual_canonical_name ?? "",
      manual_category: manual.manual_category ?? "",
      manual_usage_type: manual.manual_usage_type ?? "",
      notes: manual.notes ?? "",
    });
  }

  pending.sort((a, b) => {
    if (b.total_qty !== a.total_qty) return b.total_qty - a.total_qty;
    return b.estimated_value - a.estimated_value;
  });

  const csvLines = [
    CSV_COLUMNS.join(","),
    ...pending.map((row) =>
      CSV_COLUMNS.map((col) => csvEscape(row[col])).join(","),
    ),
  ];

  mkdirSync(join(REPO_ROOT, "data/imports/products-boss"), { recursive: true });
  writeFileSync(OUT_CSV, `${csvLines.join("\n")}\n`, "utf8");

  console.log("=== Export prodotti pending (review Boss) ===\n");
  console.log(`Pending esportati: ${pending.length}`);
  console.log(`Output: ${OUT_CSV}\n`);
  console.log("--- Top 50 pending (qty / valore stimato) ---");

  for (const row of pending.slice(0, 50)) {
    console.log(
      `  [qty=${row.total_qty} €${row.estimated_value}] ${row.candidate_name.slice(0, 60)}`,
    );
  }

  console.log("\npublic.products / product_stock NON modificati.");
}

runReviewBossProductsPending().catch((error: unknown) => {
  console.error("Export pending fallito:", error instanceof Error ? error.message : error);
  process.exit(1);
});
