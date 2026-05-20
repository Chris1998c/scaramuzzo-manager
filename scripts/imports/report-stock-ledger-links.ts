/**
 * Report copertura ledger links su stock_movements + reconciliation summary.
 * Usage: npm run report:stock-ledger-links
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const PAGE_SIZE = 1000;
const OUT_PATH = join(REPO_ROOT, "data/imports/products-boss/stock-ledger-links-report.json");

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
  if (!url || !serviceRoleKey) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type MovementRow = {
  id: number;
  product_id: number | null;
  from_salon: number | null;
  to_salon: number | null;
  quantity: number;
  movement_type: string;
  reason: string | null;
  sale_id: number | null;
  transfer_id: number | null;
  source: string;
  movement_group_id: string | null;
  created_by: string | null;
};

function applyMovement(
  theoretical: Map<string, number>,
  m: MovementRow,
): void {
  const productId = m.product_id;
  if (productId == null) return;
  const qty = parseNum(m.quantity);
  const mt = m.movement_type.toLowerCase();
  const bump = (salonId: number, delta: number) => {
    const key = `${productId}:${salonId}`;
    theoretical.set(key, (theoretical.get(key) ?? 0) + delta);
  };
  if (m.to_salon != null) bump(m.to_salon, qty);
  if (m.from_salon != null) {
    if (mt === "transfer") bump(m.from_salon, -Math.abs(qty));
    else bump(m.from_salon, qty);
  }
}

async function runReport(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  const movements: MovementRow[] = [];
  const saleIds = new Set<number>();
  const transferIds = new Set<number>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, product_id, from_salon, to_salon, quantity, movement_type, reason, sale_id, transfer_id, source, movement_group_id, created_by",
      )
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      movements.push({
        id: Number(row.id),
        product_id: row.product_id == null ? null : Number(row.product_id),
        from_salon: row.from_salon == null ? null : Number(row.from_salon),
        to_salon: row.to_salon == null ? null : Number(row.to_salon),
        quantity: parseNum(row.quantity),
        movement_type: String(row.movement_type ?? ""),
        reason: row.reason == null ? null : String(row.reason),
        sale_id: row.sale_id == null ? null : Number(row.sale_id),
        transfer_id: row.transfer_id == null ? null : Number(row.transfer_id),
        source: String(row.source ?? "legacy"),
        movement_group_id: row.movement_group_id ?? null,
        created_by: row.created_by ?? null,
      });
      if (row.sale_id != null) saleIds.add(Number(row.sale_id));
      if (row.transfer_id != null) transferIds.add(Number(row.transfer_id));
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const { data: salesCheck } = await supabase.from("sales").select("id");
  const { data: transfersCheck } = await supabase.from("transfers").select("id");
  const validSaleIds = new Set((salesCheck ?? []).map((r) => Number(r.id)));
  const validTransferIds = new Set((transfersCheck ?? []).map((r) => Number(r.id)));

  const sourceDist: Record<string, number> = {};
  let saleWithoutSaleId = 0;
  let transferWithoutTransferId = 0;
  let baselineNotBaseline = 0;
  let groupNull = 0;
  let withCreatedBy = 0;
  let orphanSaleId = 0;
  let orphanTransferId = 0;

  for (const m of movements) {
    sourceDist[m.source] = (sourceDist[m.source] ?? 0) + 1;
    if (m.movement_type === "sale" && m.sale_id == null) saleWithoutSaleId++;
    if (m.movement_type === "transfer" && m.transfer_id == null) transferWithoutTransferId++;
    if (m.reason === "boss_import_baseline" && m.source !== "baseline") baselineNotBaseline++;
    if (m.movement_group_id == null) groupNull++;
    if (m.created_by) withCreatedBy++;
    if (m.sale_id != null && !validSaleIds.has(m.sale_id)) orphanSaleId++;
    if (m.transfer_id != null && !validTransferIds.has(m.transfer_id)) orphanTransferId++;
  }

  const stockRows: { product_id: number; salon_id: number; quantity: number }[] = [];
  offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("product_stock")
      .select("product_id, salon_id, quantity")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      stockRows.push({
        product_id: Number(row.product_id),
        salon_id: Number(row.salon_id),
        quantity: parseNum(row.quantity),
      });
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const theoretical = new Map<string, number>();
  for (const m of movements) applyMovement(theoretical, m);

  let pairsNonZeroDelta = 0;
  let totalAbsDelta = 0;
  const stockKeys = new Set<string>();
  for (const s of stockRows) {
    stockKeys.add(`${s.product_id}:${s.salon_id}`);
    const mov = theoretical.get(`${s.product_id}:${s.salon_id}`) ?? 0;
    const delta = s.quantity - mov;
    if (Math.abs(delta) > 1e-9) {
      pairsNonZeroDelta++;
      totalAbsDelta += Math.abs(delta);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    stock_movements_total: movements.length,
    source_distribution: sourceDist,
    sale_movements_without_sale_id: saleWithoutSaleId,
    transfer_movements_without_transfer_id: transferWithoutTransferId,
    baseline_reason_not_source_baseline: baselineNotBaseline,
    movements_with_null_movement_group_id: groupNull,
    created_by_coverage: {
      with_created_by: withCreatedBy,
      without_created_by: movements.length - withCreatedBy,
      pct: movements.length
        ? Math.round((withCreatedBy / movements.length) * 1000) / 10
        : 0,
    },
    orphan_fk: {
      sale_id: orphanSaleId,
      transfer_id: orphanTransferId,
    },
    reconciliation: {
      product_stock_rows: stockRows.length,
      pairs_with_nonzero_delta: pairsNonZeroDelta,
      total_absolute_delta: Math.round(totalAbsDelta * 100) / 100,
    },
  };

  mkdirSync(join(REPO_ROOT, "data/imports/products-boss"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("=== Report ledger links ===\n");
  console.log(`stock_movements: ${report.stock_movements_total}`);
  console.log("source:", report.source_distribution);
  console.log(`sale senza sale_id: ${report.sale_movements_without_sale_id}`);
  console.log(`transfer senza transfer_id: ${report.transfer_movements_without_transfer_id}`);
  console.log(`baseline reason ma source!=baseline: ${report.baseline_reason_not_source_baseline}`);
  console.log(`movement_group_id null: ${report.movements_with_null_movement_group_id}`);
  console.log(
    `created_by: ${report.created_by_coverage.with_created_by}/${report.stock_movements_total} (${report.created_by_coverage.pct}%)`,
  );
  console.log(`orphan sale_id: ${report.orphan_fk.sale_id}`);
  console.log(`orphan transfer_id: ${report.orphan_fk.transfer_id}`);
  console.log("reconciliation:", report.reconciliation);
  console.log(`\nJSON: ${OUT_PATH}`);
}

runReport().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
