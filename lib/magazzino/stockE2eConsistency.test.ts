import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CANCEL_MIGRATION =
  "supabase/migrations/20261111170000_cancel_void_receipt_restore_only_pending.sql";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}

describe("stock e2e consistency (isolated Postgres)", () => {
  it(
    "carico/scarico/transfer/sale/retry/void cancel/void reverse",
    () => {
      const name = `stock-e2e-${Date.now()}`;
      try {
        execFileSync(
          "docker",
          [
            "run",
            "-d",
            "--name",
            name,
            "-e",
            "POSTGRES_PASSWORD=postgres",
            "postgres:16-alpine",
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let ready = false;
        for (let i = 0; i < 30; i++) {
          try {
            execFileSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], {
              stdio: ["ignore", "pipe", "pipe"],
            });
            ready = true;
            break;
          } catch {
            execFileSync("sleep", ["1"]);
          }
        }
        expect(ready).toBe(true);

        dockerPsql(
          name,
          readFileSync(join(ROOT, "scripts/auth/stock_e2e_isolated_setup.sql"), "utf8"),
        );
        dockerPsql(
          name,
          readFileSync(join(ROOT, "scripts/auth/stock_move_live.sql"), "utf8"),
        );
        dockerPsql(
          name,
          readFileSync(join(ROOT, "scripts/auth/reverse_sale_stock_for_void_live.sql"), "utf8"),
        );
        dockerPsql(name, readFileSync(join(ROOT, CANCEL_MIGRATION), "utf8"));

        const q = (sql: string) => dockerPsql(name, sql);

        // --- carico centrale → sede (warehouse style: trasferimento 5→1) ---
        q(`SELECT public.stock_move(7, 3, 5, 1, 'trasferimento', 't1',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, null,null,null,null,null,null,'transfer');`);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=5 AND product_id=7")).toBe(
          "97",
        );
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "13",
        );
        // retry same request_id: no second movement / qty unchanged
        const idem = q(`SELECT (public.stock_move(7, 3, 5, 1, 'trasferimento', 't1',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, null,null,null,null,null,null,'transfer'))->>'idempotent';`);
        expect(["t", "true"]).toContain(idem);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=5 AND product_id=7")).toBe(
          "97",
        );
        expect(q("SELECT count(*)::text FROM stock_movements")).toBe("1");

        // --- carico reception-style (from null) ---
        q(`SELECT public.stock_move(7, 2, null, 2, 'carico', 'c1',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid, null,null,null,null,null,null,'manual');`);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=2 AND product_id=7")).toBe(
          "2",
        );

        // --- scarico ---
        q(`SELECT public.stock_move(7, 1, 1, null, 'scarico', 's1',
          'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid, null,null,null,null,null,null,'manual');`);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "12",
        );

        // --- scarico insufficiente: errore, giacenza invariata ---
        let scaricoFail = false;
        try {
          q(`SELECT public.stock_move(7, 999, 1, null, 'scarico', 's-bad',
            'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid, null,null,null,null,null,null,'manual');`);
        } catch {
          scaricoFail = true;
        }
        expect(scaricoFail).toBe(true);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "12",
        );

        // --- vendita (sale) ---
        q(`INSERT INTO sales (salon_id, status, fiscal_status) VALUES (1, 'posted', 'printed');
           INSERT INTO sale_items (sale_id, product_id, quantity, price)
           SELECT id, 7, 2, 10 FROM sales ORDER BY id DESC LIMIT 1;`);
        const saleId = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
        q(`SELECT public.stock_move(7, 2, 1, null, 'sale', 'Vendita #${saleId}',
          'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'::uuid, ${saleId}, null, null, null, null,
          public.ledger_movement_group_from_text('sale:${saleId}'), 'sale');`);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "10",
        );
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${saleId} AND source='sale'`,
          ),
        ).toBe("1");

        // --- void cancel: NO stock restore; ledger back to posted/printed ---
        q(`UPDATE sales SET status='fiscal_void_pending' WHERE id=${saleId};
           INSERT INTO fiscal_print_jobs (salon_id, kind, sale_id, status)
           VALUES (1, 'void_receipt', ${saleId}, 'pending');`);
        const jobId = q(
          `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${saleId} AND kind='void_receipt' LIMIT 1`,
        );
        q(`SELECT * FROM public.cancel_fiscal_print_job(${jobId}, 'test');`);
        expect(q(`SELECT status FROM sales WHERE id=${saleId}`)).toBe("posted");
        expect(q(`SELECT fiscal_status FROM sales WHERE id=${saleId}`)).toBe("printed");
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "10",
        );
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${saleId} AND source='void_reversal'`,
          ),
        ).toBe("0");

        // --- void completed path: reverse once + idempotent ---
        q(
          `UPDATE sales SET status='fiscally_voided', fiscal_status='voided' WHERE id=${saleId};`,
        );
        q(`SELECT public.reverse_sale_stock_for_void(${saleId}, null);`);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "12",
        );
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${saleId} AND source='void_reversal'`,
          ),
        ).toBe("1");
        const revIdem = q(
          `SELECT (public.reverse_sale_stock_for_void(${saleId}, null))->>'idempotent';`,
        );
        expect(["t", "true"]).toContain(revIdem);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "12",
        );
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${saleId} AND source='void_reversal'`,
          ),
        ).toBe("1");
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], { stdio: ["ignore", "pipe", "pipe"] });
        } catch {
          // ignore
        }
      }
    },
    180_000,
  );
});

describe("cancel void_receipt migration (static)", () => {
  it("restores posted/printed only for pending, without reverse_sale_stock", () => {
    const sql = readFileSync(join(ROOT, CANCEL_MIGRATION), "utf8");
    expect(sql).toMatch(/void_receipt/);
    expect(sql).toMatch(/AND v_status = 'pending'/);
    expect(sql).toMatch(/fiscal_void_pending/);
    expect(sql).toMatch(/status = 'posted'/);
    expect(sql).not.toMatch(/PERFORM public\.reverse_sale_stock_for_void/);
  });
});
