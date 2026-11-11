import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}

describe("create_and_execute_transfer multi-line atomicity (isolated)", () => {
  it(
    "fails all lines on insufficient stock; retry same client_request_id stays clean then idempotent success",
    () => {
      const name = `xfer-atomic-${Date.now()}`;
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

        const q = (sql: string) => dockerPsql(name, sql);
        q(readFileSync(join(ROOT, "scripts/auth/stock_e2e_isolated_setup.sql"), "utf8"));
        q(`INSERT INTO public.products (id, active) VALUES (8, true);
           INSERT INTO public.product_stock (product_id, salon_id, quantity) VALUES
             (8, 5, 1),
             (8, 1, 0);`);
        q(readFileSync(join(ROOT, "scripts/auth/stock_move_live.sql"), "utf8"));
        q(`
CREATE OR REPLACE FUNCTION public.is_coordinator() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.is_magazzino() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
`);
        q(readFileSync(join(ROOT, "scripts/auth/execute_transfer_live.sql"), "utf8"));
        q(
          readFileSync(
            join(ROOT, "scripts/auth/create_and_execute_transfer_live.sql"),
            "utf8",
          ),
        );

        const rid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
        const actor = "44444444-4444-4444-8444-444444444444";

        const stockSnapshot = () =>
          q(`SELECT string_agg(product_id::text || ':' || salon_id::text || '=' || quantity::text, ',' ORDER BY product_id, salon_id)
             FROM product_stock WHERE product_id IN (7,8) AND salon_id IN (1,5)`);

        const before = stockSnapshot();
        expect(before).toMatch(/7:5=100/);
        expect(before).toMatch(/8:5=1/);

        // Line OK (7 qty 3) + line insufficient (8 qty 5 > 1) → fail entire transfer
        let failed = false;
        try {
          q(`SELECT public.create_and_execute_transfer(
            5, 1,
            '[{"id":7,"qty":3},{"id":8,"qty":5}]'::jsonb,
            '${rid}'::uuid,
            '${actor}'::uuid,
            null, 'test', 'atomic-fail', true
          );`);
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
        expect(stockSnapshot()).toBe(before);
        expect(q("SELECT count(*)::text FROM stock_movements")).toBe("0");
        expect(q("SELECT count(*)::text FROM transfers")).toBe("0");
        expect(q("SELECT count(*)::text FROM transfer_items")).toBe("0");
        expect(
          q(
            `SELECT count(*)::text FROM transfers WHERE client_request_id='${rid}'::uuid`,
          ),
        ).toBe("0");

        // Retry same client_request_id with same insufficient payload → still clean fail
        let failedRetry = false;
        try {
          q(`SELECT public.create_and_execute_transfer(
            5, 1,
            '[{"id":7,"qty":3},{"id":8,"qty":5}]'::jsonb,
            '${rid}'::uuid,
            '${actor}'::uuid,
            null, 'test', 'atomic-fail-retry', true
          );`);
        } catch {
          failedRetry = true;
        }
        expect(failedRetry).toBe(true);
        expect(stockSnapshot()).toBe(before);
        expect(q("SELECT count(*)::text FROM stock_movements")).toBe("0");
        expect(
          q(
            `SELECT count(*)::text FROM transfers WHERE client_request_id='${rid}'::uuid`,
          ),
        ).toBe("0");

        // Same request id with valid lines → succeeds once
        const ok = q(`SELECT public.create_and_execute_transfer(
          5, 1,
          '[{"id":7,"qty":3},{"id":8,"qty":1}]'::jsonb,
          '${rid}'::uuid,
          '${actor}'::uuid,
          null, 'test', 'atomic-ok', true
        )::text;`);
        expect(ok).toMatch(/"ok":\s*true/);
        expect(ok).toMatch(/"idempotent":\s*false/);
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=5 AND product_id=7")).toBe(
          "97",
        );
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7")).toBe(
          "13",
        );
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=5 AND product_id=8")).toBe(
          "0",
        );
        expect(q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=8")).toBe(
          "1",
        );
        expect(q("SELECT count(*)::text FROM stock_movements")).toBe("2");
        expect(
          q(
            `SELECT status FROM transfers WHERE client_request_id='${rid}'::uuid`,
          ),
        ).toBe("executed");

        // Idempotent replay: no second movements / qty unchanged
        const afterOk = stockSnapshot();
        const replay = q(`SELECT public.create_and_execute_transfer(
          5, 1,
          '[{"id":7,"qty":3},{"id":8,"qty":1}]'::jsonb,
          '${rid}'::uuid,
          '${actor}'::uuid,
          null, 'test', 'atomic-ok-replay', true
        )::text;`);
        expect(replay).toMatch(/"idempotent":\s*true/);
        expect(stockSnapshot()).toBe(afterOk);
        expect(q("SELECT count(*)::text FROM stock_movements")).toBe("2");
        expect(q("SELECT count(*)::text FROM transfers")).toBe("1");
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
