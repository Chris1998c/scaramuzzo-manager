#!/usr/bin/env node
/**
 * Verifica isolata SQL↔TS dell'allocazione Hamilton (maggiori resti).
 * Avvia Postgres Docker temporaneo, applica lo snippet di allocazione,
 * confronta con allocateSaleGlobalDiscount.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load TS helper via vitest/tsx-less: duplicate minimal runner by spawning node --import tsx if available
async function loadTsHelper() {
  try {
    const mod = await import(
      path.join(root, "lib/reports/allocateSaleGlobalDiscount.ts")
    );
    return mod;
  } catch {
    // fallback: compile with npx tsx
    const r = spawnSync(
      "npx",
      [
        "--yes",
        "tsx",
        "-e",
        `
        import * as m from './lib/reports/allocateSaleGlobalDiscount.ts';
        console.log(JSON.stringify({
          cases: globalThis.__CASES__.map(c => {
            const out = m.allocateSaleGlobalDiscount(c);
            return { shares: out.lines.map(l => l.globalShare), totals: out.lines.map(l => l.lineTotalGross), pool: out.globalPool, anomalies: out.anomalies };
          })
        }));
        `,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env },
        input: "",
      },
    );
    throw new Error(
      `direct import failed; use docker sql + vitest parity instead: ${r.stderr || r.stdout}`,
    );
  }
}

const CASES = [
  {
    name: "four_cents",
    lines: [
      { price: 0.01, quantity: 1, lineDiscount: 0, lineId: 101 },
      { price: 0.01, quantity: 1, lineDiscount: 0, lineId: 102 },
      { price: 0.01, quantity: 1, lineDiscount: 0, lineId: 103 },
      { price: 0.01, quantity: 1, lineDiscount: 0, lineId: 104 },
    ],
    saleTotal: 0.02,
  },
  {
    name: "last_free",
    lines: [
      { price: 10, quantity: 1, lineDiscount: 0, lineId: 1 },
      { price: 10, quantity: 1, lineDiscount: 0, lineId: 2 },
      { price: 5, quantity: 1, lineDiscount: 5, lineId: 3 },
    ],
    saleTotal: 19.95,
  },
  {
    name: "hundred_percent",
    lines: [
      { price: 40, quantity: 1, lineDiscount: 40, lineId: 1 },
      { price: 20, quantity: 1, lineDiscount: 20, lineId: 2 },
    ],
    saleTotal: 0,
  },
  {
    name: "line_plus_global",
    lines: [
      { price: 100, quantity: 1, lineDiscount: 20, lineId: 1 },
      { price: 50, quantity: 1, lineDiscount: 10, lineId: 2 },
    ],
    saleTotal: 108,
  },
  {
    name: "staff_split",
    lines: [
      { price: 100, quantity: 1, lineDiscount: 0, lineId: 11 },
      { price: 50, quantity: 1, lineDiscount: 0, lineId: 22 },
    ],
    saleTotal: 135,
  },
  {
    name: "surcharge_anomaly",
    lines: [{ price: 50, quantity: 1, lineDiscount: 0, lineId: 1 }],
    saleTotal: 60,
  },
];

const SCHEMA_SQL = `
CREATE TEMP TABLE alloc_in (
  case_name text,
  sale_item_id int,
  price numeric,
  quantity numeric,
  line_discount numeric,
  sale_total numeric
);
`;

const COMPUTE_SQL = `
CREATE TEMP TABLE alloc_out AS
WITH base AS (
  SELECT
    case_name,
    sale_item_id,
    price,
    quantity,
    line_discount,
    sale_total,
    round(greatest(0::numeric, price * quantity - line_discount)::numeric, 2) AS line_base
  FROM alloc_in
),
cents AS (
  SELECT
    b.*,
    round(b.line_base * 100)::bigint AS base_cents,
    round(b.sale_total * 100)::bigint AS sale_total_cents,
    (sum(round(b.line_base * 100)::bigint) OVER (PARTITION BY b.case_name))::bigint AS bases_sum_cents
  FROM base b
),
pooled AS (
  SELECT
    c.*,
    GREATEST(0::bigint, c.bases_sum_cents - GREATEST(c.sale_total_cents, 0::bigint)) AS global_pool_cents
  FROM cents c
),
floored AS (
  SELECT
    p.*,
    CASE
      WHEN p.bases_sum_cents <= 0 OR p.base_cents <= 0 OR p.global_pool_cents <= 0 THEN 0::bigint
      ELSE LEAST(p.base_cents, (p.global_pool_cents * p.base_cents) / p.bases_sum_cents)
    END AS floor_cents,
    CASE
      WHEN p.bases_sum_cents <= 0 OR p.base_cents <= 0 OR p.global_pool_cents <= 0 THEN 0::bigint
      ELSE (p.global_pool_cents * p.base_cents) % p.bases_sum_cents
    END AS rem_cents
  FROM pooled p
),
with_left AS (
  SELECT
    f.*,
    f.global_pool_cents - (sum(f.floor_cents) OVER (PARTITION BY f.case_name))::bigint AS leftover_cents
  FROM floored f
),
ranked AS (
  SELECT
    w.*,
    row_number() OVER (
      PARTITION BY w.case_name
      ORDER BY
        CASE WHEN w.base_cents > w.floor_cents THEN 0 ELSE 1 END,
        w.rem_cents DESC,
        w.sale_item_id ASC
    ) AS rem_rank
  FROM with_left w
)
SELECT
  case_name,
  sale_item_id,
  round(((base_cents - (
    floor_cents + CASE WHEN base_cents > floor_cents AND rem_rank <= leftover_cents THEN 1 ELSE 0 END
  ))::numeric) / 100, 2) AS line_total_gross,
  round(((
    floor_cents + CASE WHEN base_cents > floor_cents AND rem_rank <= leftover_cents THEN 1 ELSE 0 END
  )::numeric) / 100, 2) AS global_share,
  round((global_pool_cents::numeric) / 100, 2) AS global_pool
FROM ranked
ORDER BY case_name, sale_item_id;
`;

function dockerAvailable() {
  const r = spawnSync("docker", ["info"], { encoding: "utf8" });
  return r.status === 0;
}

function run() {
  if (!dockerAvailable()) {
    console.error("FAIL: Docker non disponibile per Postgres isolato");
    process.exit(2);
  }

  const name = `scaramuzzo-alloc-parity-${Date.now()}`;
  const runSqlScript = (sql) => {
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        name,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-t",
        "-A",
        "-F",
        ",",
      ],
      { encoding: "utf8", input: sql },
    );
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || "psql failed");
    }
    return r.stdout.trim();
  };

  console.log("Starting ephemeral Postgres...");
  let up = spawnSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      name,
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:16-alpine",
    ],
    { encoding: "utf8" },
  );
  if (up.status !== 0) {
    console.error(up.stderr);
    process.exit(1);
  }

  try {
    for (let i = 0; i < 40; i++) {
      const ready = spawnSync(
        "docker",
        ["exec", name, "pg_isready", "-U", "postgres"],
        { encoding: "utf8" },
      );
      if (ready.status === 0) break;
      spawnSync("sleep", ["0.5"]);
      if (i === 39) throw new Error("postgres not ready");
    }

    const inserts = CASES.flatMap((c) =>
      c.lines.map(
        (l) =>
          `INSERT INTO alloc_in VALUES ('${c.name}', ${l.lineId}, ${l.price}, ${l.quantity}, ${l.lineDiscount}, ${c.saleTotal});`,
      ),
    ).join("\n");

    const out = runSqlScript(`
${SCHEMA_SQL}
${inserts}
${COMPUTE_SQL}
SELECT case_name || '|' || sale_item_id || '|' || global_share || '|' || line_total_gross || '|' || global_pool
FROM alloc_out
ORDER BY case_name, sale_item_id;
`);
    const sqlRows = out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [case_name, sale_item_id, global_share, line_total_gross, global_pool] =
          line.split("|");
        return {
          case_name,
          sale_item_id: Number(sale_item_id),
          global_share: Number(global_share),
          line_total_gross: Number(line_total_gross),
          global_pool: Number(global_pool),
        };
      });

    // TS via vitest-less: spawn node with compiled path using npx tsx
    const tsPayload = JSON.stringify(CASES);
    const tsRun = spawnSync(
      "npx",
      [
        "--yes",
        "tsx",
        "-e",
        `
import { allocateSaleGlobalDiscount } from "./lib/reports/allocateSaleGlobalDiscount.ts";
const cases = ${tsPayload};
const out = cases.map(c => {
  const r = allocateSaleGlobalDiscount(c);
  return {
    name: c.name,
    rows: r.lines.map(l => ({
      sale_item_id: l.lineId,
      global_share: l.globalShare,
      line_total_gross: l.lineTotalGross,
    })),
    pool: r.globalPool,
    anomalies: r.anomalies,
  };
});
console.log(JSON.stringify(out));
`,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (tsRun.status !== 0) {
      console.error(tsRun.stderr || tsRun.stdout);
      process.exit(1);
    }
    const tsOut = JSON.parse(tsRun.stdout.trim().split("\n").pop());

    let failed = 0;
    for (const c of tsOut) {
      const sqlCase = sqlRows.filter((r) => r.case_name === c.name);
      if (sqlCase.length !== c.rows.length) {
        console.error(`FAIL ${c.name}: row count sql=${sqlCase.length} ts=${c.rows.length}`);
        failed++;
        continue;
      }
      for (const row of c.rows) {
        const s = sqlCase.find((x) => x.sale_item_id === row.sale_item_id);
        if (!s) {
          console.error(`FAIL ${c.name}: missing sql id ${row.sale_item_id}`);
          failed++;
          continue;
        }
        if (
          Number(s.global_share) !== Number(row.global_share) ||
          Number(s.line_total_gross) !== Number(row.line_total_gross) ||
          Number(s.global_pool) !== Number(c.pool)
        ) {
          console.error(`FAIL ${c.name} id=${row.sale_item_id}`, { sql: s, ts: row, pool: c.pool });
          failed++;
        }
      }
      console.log(
        `OK ${c.name} pool=${c.pool} anomalies=${JSON.stringify(c.anomalies)}`,
      );
    }

    if (failed) {
      console.error(`Parity failures: ${failed}`);
      process.exit(1);
    }
    console.log("SQL↔TS parity OK");
  } finally {
    spawnSync("docker", ["rm", "-f", name], { encoding: "utf8" });
  }
}

run();
