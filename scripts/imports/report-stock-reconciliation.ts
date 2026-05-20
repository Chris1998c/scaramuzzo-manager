/**
 * Report read-only: product_stock vs qty teorica da stock_movements.
 * NON scrive su DB. Genera JSON + CSV in data/imports/products-boss/.
 *
 * Usage: npm run report:stock-reconciliation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = process.cwd();
const PAGE_SIZE = 1000;
const OUT_DIR = join(REPO_ROOT, "data/imports/products-boss");
const REPORT_JSON = join(OUT_DIR, "stock-reconciliation-report.json");
const DELTAS_CSV = join(OUT_DIR, "stock-reconciliation-deltas.csv");
const TOP_N = 50;

type ProductRow = { id: number; name: string };
type SalonRow = { id: number; name: string };
type StockRow = {
  product_id: number;
  salon_id: number;
  quantity: number;
};
type MovementRow = {
  id: number;
  product_id: number | null;
  from_salon: number | null;
  to_salon: number | null;
  quantity: number;
  movement_type: string;
  created_at: string;
};

type PairKey = string;

type PairReconciliation = {
  product_id: number;
  salon_id: number;
  product_name: string;
  salon_name: string;
  stock_quantity: number;
  movement_quantity: number;
  delta: number;
  movements_count: number;
  last_movement_at: string | null;
  has_product_stock: boolean;
  has_movements: boolean;
};

function pairKey(productId: number, salonId: number): PairKey {
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

/**
 * Ricostruisce la qty teorica per (product_id, salon_id) dal log movimenti.
 *
 * Schema reale (stock_move):
 * - load: solo to_salon, quantity > 0
 * - sale / unload: solo from_salon, quantity < 0 (già firmata)
 * - transfer: from + to, quantity > 0 (una riga: decrementa from, incrementa to)
 */
function applyMovementToTheoretical(
  theoretical: Map<PairKey, number>,
  movementMeta: Map<PairKey, { count: number; lastAt: string | null }>,
  m: MovementRow,
): void {
  const productId = m.product_id;
  if (productId == null || !Number.isFinite(productId)) return;

  const qty = parseNum(m.quantity);
  const mt = String(m.movement_type ?? "").toLowerCase().trim();

  const bumpMeta = (salonId: number, deltaQty: number) => {
    const key = pairKey(productId, salonId);
    theoretical.set(key, (theoretical.get(key) ?? 0) + deltaQty);
    const prev = movementMeta.get(key);
    const created = m.created_at ?? null;
    movementMeta.set(key, {
      count: (prev?.count ?? 0) + 1,
      lastAt:
        prev?.lastAt && created
          ? prev.lastAt > created
            ? prev.lastAt
            : created
          : prev?.lastAt ?? created,
    });
  };

  if (m.to_salon != null && Number.isFinite(m.to_salon)) {
    bumpMeta(m.to_salon, qty);
  }

  if (m.from_salon != null && Number.isFinite(m.from_salon)) {
    if (mt === "transfer") {
      bumpMeta(m.from_salon, -Math.abs(qty));
    } else {
      // sale, unload: quantity già negativa in DB
      bumpMeta(m.from_salon, qty);
    }
  }
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function runReport(): Promise<void> {
  loadEnvLocal();
  const supabase = createSupabaseAdmin();

  console.log("=== Stock reconciliation (read-only) ===\n");

  const [products, salons, stockRows, movements] = await Promise.all([
    fetchAll<ProductRow>("products", async (offset) => {
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
    fetchAll<SalonRow>("salons", async (offset) => {
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
    fetchAll<MovementRow>("stock_movements", async (offset) => {
      const r = await supabase
        .from("stock_movements")
        .select("id, product_id, from_salon, to_salon, quantity, movement_type, created_at")
        .order("id")
        .range(offset, offset + PAGE_SIZE - 1);
      return {
        data: (r.data ?? []).map((row) => ({
          id: Number(row.id),
          product_id: row.product_id == null ? null : Number(row.product_id),
          from_salon: row.from_salon == null ? null : Number(row.from_salon),
          to_salon: row.to_salon == null ? null : Number(row.to_salon),
          quantity: parseNum(row.quantity),
          movement_type: String(row.movement_type ?? ""),
          created_at: String(row.created_at ?? ""),
        })),
        error: r.error,
      };
    }),
  ]);

  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const salonNameById = new Map(salons.map((s) => [s.id, s.name]));

  const stockByKey = new Map<PairKey, number>();
  for (const row of stockRows) {
    if (!Number.isFinite(row.product_id) || !Number.isFinite(row.salon_id)) continue;
    stockByKey.set(pairKey(row.product_id, row.salon_id), row.quantity);
  }

  const theoretical = new Map<PairKey, number>();
  const movementMeta = new Map<PairKey, { count: number; lastAt: string | null }>();

  const movementTypeDistribution: Record<string, number> = {};
  let movementsWithoutProductId = 0;
  let movementsWithoutSalon = 0;

  for (const m of movements) {
    const mt = String(m.movement_type ?? "unknown").toLowerCase() || "unknown";
    movementTypeDistribution[mt] = (movementTypeDistribution[mt] ?? 0) + 1;

    if (m.product_id == null || !Number.isFinite(m.product_id)) {
      movementsWithoutProductId++;
      continue;
    }

    const hasFrom = m.from_salon != null && Number.isFinite(m.from_salon);
    const hasTo = m.to_salon != null && Number.isFinite(m.to_salon);
    if (!hasFrom && !hasTo) {
      movementsWithoutSalon++;
      continue;
    }

    applyMovementToTheoretical(theoretical, movementMeta, m);
  }

  const allKeys = new Set<PairKey>([...stockByKey.keys(), ...theoretical.keys()]);
  const rows: PairReconciliation[] = [];

  for (const key of allKeys) {
    const [productIdStr, salonIdStr] = key.split(":");
    const productId = Number(productIdStr);
    const salonId = Number(salonIdStr);
    const stockQty = stockByKey.get(key) ?? 0;
    const movementQty = theoretical.get(key) ?? 0;
    const meta = movementMeta.get(key);
    const hasStock = stockByKey.has(key);
    const hasMov = theoretical.has(key) && (meta?.count ?? 0) > 0;

    rows.push({
      product_id: productId,
      salon_id: salonId,
      product_name: productNameById.get(productId) ?? `Prodotto ${productId}`,
      salon_name: salonNameById.get(salonId) ?? `Salone ${salonId}`,
      stock_quantity: stockQty,
      movement_quantity: movementQty,
      delta: stockQty - movementQty,
      movements_count: meta?.count ?? 0,
      last_movement_at: meta?.lastAt ?? null,
      has_product_stock: hasStock,
      has_movements: hasMov,
    });
  }

  rows.sort((a, b) => {
    const ad = Math.abs(b.delta) - Math.abs(a.delta);
    if (ad !== 0) return ad;
    if (a.salon_id !== b.salon_id) return a.salon_id - b.salon_id;
    return a.product_id - b.product_id;
  });

  const nonZeroDelta = rows.filter((r) => Math.abs(r.delta) > 1e-9);
  const totalAbsoluteDelta = rows.reduce((s, r) => s + Math.abs(r.delta), 0);

  const deltaBySalon: Record<
    string,
    {
      salon_id: number;
      salon_name: string;
      pairs: number;
      pairs_with_delta: number;
      sum_delta: number;
      sum_abs_delta: number;
      stock_only_no_movements: number;
      movements_only_no_stock: number;
    }
  > = {};

  for (const r of rows) {
    const sk = String(r.salon_id);
    if (!deltaBySalon[sk]) {
      deltaBySalon[sk] = {
        salon_id: r.salon_id,
        salon_name: r.salon_name,
        pairs: 0,
        pairs_with_delta: 0,
        sum_delta: 0,
        sum_abs_delta: 0,
        stock_only_no_movements: 0,
        movements_only_no_stock: 0,
      };
    }
    const b = deltaBySalon[sk];
    b.pairs++;
    if (Math.abs(r.delta) > 1e-9) b.pairs_with_delta++;
    b.sum_delta += r.delta;
    b.sum_abs_delta += Math.abs(r.delta);
    if (r.has_product_stock && !r.has_movements && r.stock_quantity > 0) {
      b.stock_only_no_movements++;
    }
    if (r.has_movements && !r.has_product_stock) {
      b.movements_only_no_stock++;
    }
  }

  const productStockWithoutMovements = rows.filter(
    (r) => r.has_product_stock && !r.has_movements && Math.abs(r.stock_quantity) > 1e-9,
  );
  const movementsWithoutProductStock = rows.filter(
    (r) => r.has_movements && !r.has_product_stock,
  );

  const baselineCandidates = rows.filter(
    (r) =>
      (r.has_product_stock && !r.has_movements && Math.abs(r.stock_quantity) > 1e-9) ||
      (Math.abs(r.delta) > 1e-9 && r.stock_quantity > 0),
  );

  const topDeltas = rows.slice(0, TOP_N).map((r) => ({
    product_id: r.product_id,
    salon_id: r.salon_id,
    product_name: r.product_name,
    salon_name: r.salon_name,
    stock_quantity: r.stock_quantity,
    movement_quantity: r.movement_quantity,
    delta: r.delta,
    movements_count: r.movements_count,
    last_movement_at: r.last_movement_at,
  }));

  const baselineNeeded =
    productStockWithoutMovements.length > 0 || nonZeroDelta.length > rows.length * 0.05;

  const report = {
    generated_at: new Date().toISOString(),
    calculation_method: {
      description:
        "Qty teorica = somma contributi per (product_id, salon_id) da stock_movements.",
      quantity_sign_in_db:
        "load e transfer: quantity positiva; sale e unload: quantity negativa (stock_move).",
      rules: [
        "Se to_salon valorizzato: theoretical[to] += quantity",
        "Se from_salon valorizzato e movement_type=transfer: theoretical[from] -= abs(quantity)",
        "Se from_salon valorizzato e movement_type in (sale, unload, ...): theoretical[from] += quantity (già negativa)",
      ],
      note:
        "Allineato a stock_move + view stock_levels (to += qty; from transfer -= qty; from sale += qty firmata).",
    },
    totals: {
      products_count: products.length,
      salons_count: salons.length,
      product_stock_rows: stockRows.length,
      stock_movements_rows: movements.length,
      union_pairs: rows.length,
      pairs_with_nonzero_delta: nonZeroDelta.length,
      total_absolute_delta: round2(totalAbsoluteDelta),
      movements_without_product_id: movementsWithoutProductId,
      movements_without_salon: movementsWithoutSalon,
      product_stock_without_movements: productStockWithoutMovements.length,
      movements_without_product_stock: movementsWithoutProductStock.length,
      baseline_candidate_pairs: baselineCandidates.length,
    },
    movement_type_distribution: movementTypeDistribution,
    delta_by_salon: Object.values(deltaBySalon).sort((a, b) => a.salon_id - b.salon_id),
    top_deltas: topDeltas,
    baseline_needed: baselineNeeded,
    baseline_recommendation: baselineNeeded
      ? "Sì: creare movimenti opening_balance/load per coppie con giacenza Boss senza movimenti e/o allineare delta prima della timeline enterprise."
      : "Probabilmente no per la maggior parte; verificare le poche coppie con delta residuo.",
    next_step_proposal: baselineNeeded
      ? [
          "1. Eseguire script baseline (dry-run) solo per coppie stock_only_no_movements con stock_quantity > 0.",
          "2. Rieseguire questo report e confermare pairs_with_nonzero_delta ~ 0.",
          "3. Solo dopo: migration schema audit (sale_id, transfer_id) + UI timeline.",
        ]
      : [
          "1. Investigare manualmente le coppie in top_deltas (errori operativi o movimenti mancanti).",
          "2. Procedere con schema audit + UI timeline senza baseline massiva.",
        ],
    all_pairs_sample_count: rows.length,
  };

  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");

  const csvHeader = [
    "product_id",
    "salon_id",
    "product_name",
    "salon_name",
    "stock_quantity",
    "movement_quantity",
    "delta",
    "movements_count",
    "last_movement_at",
    "has_product_stock",
    "has_movements",
  ].join(",");

  const csvLines = [
    csvHeader,
    ...rows.map((r) =>
      [
        r.product_id,
        r.salon_id,
        csvEscape(r.product_name),
        csvEscape(r.salon_name),
        r.stock_quantity,
        r.movement_quantity,
        r.delta,
        r.movements_count,
        csvEscape(r.last_movement_at),
        r.has_product_stock ? 1 : 0,
        r.has_movements ? 1 : 0,
      ].join(","),
    ),
  ];
  writeFileSync(DELTAS_CSV, csvLines.join("\n"), "utf8");

  console.log("--- Riepilogo ---");
  console.log(`product_stock righe: ${report.totals.product_stock_rows}`);
  console.log(`stock_movements righe: ${report.totals.stock_movements_rows}`);
  console.log(`coppie (unione): ${report.totals.union_pairs}`);
  console.log(`coppie delta != 0: ${report.totals.pairs_with_nonzero_delta}`);
  console.log(`somma |delta|: ${report.totals.total_absolute_delta}`);
  console.log(`stock senza movimenti (qty>0): ${report.totals.product_stock_without_movements}`);
  console.log(`movimenti senza product_stock: ${report.totals.movements_without_product_stock}`);
  console.log(`baseline necessaria: ${report.baseline_needed ? "SÌ" : "NO"}`);
  console.log("\n--- movement_type ---");
  for (const [k, v] of Object.entries(movementTypeDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("\n--- delta per salone ---");
  for (const s of report.delta_by_salon) {
    console.log(
      `  [${s.salon_id}] ${s.salon_name}: pairs=${s.pairs} con_delta=${s.pairs_with_delta} |delta|=${round2(s.sum_abs_delta)} stock_senza_mov=${s.stock_only_no_movements}`,
    );
  }
  console.log("\n--- top 10 |delta| ---");
  for (const t of topDeltas.slice(0, 10)) {
    console.log(
      `  ${t.salon_name} / ${t.product_name}: stock=${t.stock_quantity} mov=${t.movement_quantity} delta=${t.delta} (n=${t.movements_count})`,
    );
  }
  console.log(`\nJSON: ${REPORT_JSON}`);
  console.log(`CSV:  ${DELTAS_CSV}`);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

runReport().catch((err: unknown) => {
  console.error("Report fallito:", err instanceof Error ? err.message : err);
  process.exit(1);
});
