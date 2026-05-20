/**
 * Backfill colonne ledger su stock_movements (read + update selettivo).
 * Default dry-run. Commit solo con --commit.
 *
 * Usage:
 *   npm run backfill:stock-ledger-links
 *   npm run backfill:stock-ledger-links -- --commit
 *   npm run backfill:stock-ledger-links -- --commit --limit 50
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Coerente con public.ledger_movement_group_from_text (SQL). */
function ledgerMovementGroupFromText(label: string): string {
  const hex = createHash("md5").update(`scz-ledger:${label}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "5" + hex.slice(13, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

const BOSS_BASELINE_MOVEMENT_GROUP_ID = ledgerMovementGroupFromText(
  "boss_import_baseline_bulk",
);

function movementGroupFromSaleId(saleId: number): string {
  return ledgerMovementGroupFromText(`sale:${saleId}`);
}

function movementGroupFromTransferId(transferId: number): string {
  return ledgerMovementGroupFromText(`transfer:${transferId}`);
}

const REPO_ROOT = process.cwd();
const PAGE_SIZE = 1000;
const BASELINE_REASON = "boss_import_baseline";
const UPDATE_BATCH = 50;

type MovementRow = {
  id: number;
  product_id: number | null;
  movement_type: string;
  reason: string | null;
  client_request_id: string | null;
  sale_id: number | null;
  transfer_id: number | null;
  sale_item_id: number | null;
  transfer_item_id: number | null;
  created_by: string | null;
  movement_group_id: string | null;
  source: string;
};

type UpdatePayload = {
  id: number;
  patch: Record<string, unknown>;
  kind: "baseline" | "sale" | "transfer" | "manual";
};

const SALE_REASON_RE = /(?:vendita|sale)\s*#\s*(\d+)/i;
const TRANSFER_REASON_RE = /transfer_id\s*=\s*(\d+)/i;

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
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseArgs(argv: string[]): { commit: boolean; limit: number | null } {
  const commit = argv.includes("--commit") && !argv.includes("--dry-run");
  let limit: number | null = null;
  const idx = argv.indexOf("--limit");
  if (idx >= 0 && argv[idx + 1]) {
    const n = Number(argv[idx + 1]);
    if (!Number.isFinite(n) || n < 1) process.exit(1);
    limit = Math.floor(n);
  }
  return { commit, limit };
}

function patchDiffers(row: MovementRow, patch: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(patch)) {
    const cur = (row as Record<string, unknown>)[k];
    const a = cur == null || cur === "" ? null : String(cur);
    const b = v == null ? null : String(v);
    if (a !== b) return true;
  }
  return false;
}

async function fetchAllMovements(supabase: SupabaseClient): Promise<MovementRow[]> {
  const all: MovementRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, product_id, movement_type, reason, client_request_id, sale_id, transfer_id, sale_item_id, transfer_item_id, created_by, movement_group_id, source",
      )
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      all.push({
        id: Number(row.id),
        product_id: row.product_id == null ? null : Number(row.product_id),
        movement_type: String(row.movement_type ?? ""),
        reason: row.reason == null ? null : String(row.reason),
        client_request_id: row.client_request_id ?? null,
        sale_id: row.sale_id == null ? null : Number(row.sale_id),
        transfer_id: row.transfer_id == null ? null : Number(row.transfer_id),
        sale_item_id: row.sale_item_id == null ? null : Number(row.sale_item_id),
        transfer_item_id:
          row.transfer_item_id == null ? null : Number(row.transfer_item_id),
        created_by: row.created_by ?? null,
        movement_group_id: row.movement_group_id ?? null,
        source: String(row.source ?? "legacy"),
      });
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function runBackfill(): Promise<void> {
  const { commit, limit } = parseArgs(process.argv.slice(2));
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  console.log("=== Backfill ledger links stock_movements ===\n");
  console.log(`Modalità: ${commit ? "COMMIT" : "DRY-RUN"}`);

  const [movements, salesRes, transfersRes] = await Promise.all([
    fetchAllMovements(supabase),
    supabase.from("sales").select("id"),
    supabase.from("transfers").select("id, executed_by, client_request_id"),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (transfersRes.error) throw new Error(transfersRes.error.message);

  const saleIds = new Set((salesRes.data ?? []).map((r) => Number(r.id)));
  const transferById = new Map<
    number,
    { executed_by: string | null; client_request_id: string | null }
  >();
  for (const t of transfersRes.data ?? []) {
    transferById.set(Number(t.id), {
      executed_by: (t.executed_by as string | null) ?? null,
      client_request_id: (t.client_request_id as string | null) ?? null,
    });
  }

  const updates: UpdatePayload[] = [];
  const summary = {
    total: movements.length,
    would_update: 0,
    updated: 0,
    skipped_no_change: 0,
    baseline_linked: 0,
    sale_linked: 0,
    transfer_linked: 0,
    manual_grouped: 0,
    unresolved: 0,
    errors: 0,
  };

  for (const row of movements) {
    const patch: Record<string, unknown> = {};
    let kind: UpdatePayload["kind"] | null = null;

    if (row.reason === BASELINE_REASON) {
      patch.source = "baseline";
      patch.movement_group_id = BOSS_BASELINE_MOVEMENT_GROUP_ID;
      kind = "baseline";
    } else if (row.movement_type === "sale") {
      const m = row.reason?.match(SALE_REASON_RE);
      if (m) {
        const sid = Number(m[1]);
        if (saleIds.has(sid)) {
          patch.sale_id = sid;
          patch.source = "sale";
          patch.movement_group_id = movementGroupFromSaleId(sid);
          kind = "sale";
        }
      }
    } else if (row.movement_type === "transfer") {
      const m = row.reason?.match(TRANSFER_REASON_RE);
      if (m) {
        const tid = Number(m[1]);
        const tr = transferById.get(tid);
        if (tr) {
          patch.transfer_id = tid;
          patch.source = "transfer";
          patch.movement_group_id =
            tr.client_request_id ?? movementGroupFromTransferId(tid);
          if (tr.executed_by) patch.created_by = tr.executed_by;
          kind = "transfer";
        }
      }
    }

    if (
      !kind &&
      row.client_request_id &&
      (row.source === "legacy" || !row.movement_group_id)
    ) {
      patch.movement_group_id = row.client_request_id;
      patch.source = "manual";
      kind = "manual";
    }

    if (!kind || !patchDiffers(row, patch)) {
      if (!kind && row.source === "legacy") summary.unresolved++;
      else summary.skipped_no_change++;
      continue;
    }

    updates.push({ id: row.id, patch, kind });
  }

  const batch = limit != null ? updates.slice(0, limit) : updates;
  summary.would_update = batch.length;

  for (const u of batch) {
    if (u.kind === "baseline") summary.baseline_linked++;
    if (u.kind === "sale") summary.sale_linked++;
    if (u.kind === "transfer") summary.transfer_linked++;
    if (u.kind === "manual") summary.manual_grouped++;
  }

  const samples = batch.slice(0, 12);

  if (!commit) {
    console.log("\n--- Riepilogo dry-run ---");
    console.log(`Totale movimenti: ${summary.total}`);
    console.log(`Would update: ${summary.would_update}`);
    console.log(`  baseline: ${summary.baseline_linked}`);
    console.log(`  sale: ${summary.sale_linked}`);
    console.log(`  transfer: ${summary.transfer_linked}`);
    console.log(`  manual: ${summary.manual_grouped}`);
    console.log(`Skipped (già ok / non classificati): ${summary.skipped_no_change}`);
    console.log(`Unresolved (restano legacy senza regola): ${summary.unresolved}`);
    console.log("\n--- Sample ---");
    for (const s of samples) {
      console.log(`  #${s.id} [${s.kind}]`, JSON.stringify(s.patch));
    }
    console.log("\nPer applicare: npm run backfill:stock-ledger-links -- --commit");
    return;
  }

  for (let i = 0; i < batch.length; i += UPDATE_BATCH) {
    const chunk = batch.slice(i, i + UPDATE_BATCH);
    for (const u of chunk) {
      const { error } = await supabase
        .from("stock_movements")
        .update(u.patch)
        .eq("id", u.id);
      if (error) {
        summary.errors++;
        console.error(`Update #${u.id}: ${error.message}`);
      } else {
        summary.updated++;
      }
    }
  }

  console.log("\n--- Riepilogo commit ---");
  console.log(`Updated: ${summary.updated}`);
  console.log(`  baseline: ${summary.baseline_linked}`);
  console.log(`  sale: ${summary.sale_linked}`);
  console.log(`  transfer: ${summary.transfer_linked}`);
  console.log(`  manual: ${summary.manual_grouped}`);
  console.log(`Errors: ${summary.errors}`);
  console.log(`Unresolved (pre-backfill): ${summary.unresolved}`);
  console.log("Verifica: npm run report:stock-ledger-links");
}

runBackfill().catch((e: unknown) => {
  console.error("Backfill fallito:", e instanceof Error ? e.message : e);
  process.exit(1);
});
