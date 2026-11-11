import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION_PATH =
  "supabase/migrations/20261111140000_p0_revoke_magazzino_cash_sales_postgrest_bypass.sql";
const MIGRATION = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

describe("P0 magazzino cash/sales PostgREST bypass migration (static)", () => {
  it("does not alter can_access_salon / customers / stock / fiscal / bridge", () => {
    expect(MIGRATION).not.toMatch(/CREATE OR REPLACE FUNCTION public\.can_access_salon/i);
    expect(MIGRATION).not.toMatch(/customers_/);
    expect(MIGRATION).not.toMatch(/stock_move|product_stock|stock_movements/i);
    expect(MIGRATION).not.toMatch(/fiscal_print_jobs|bridge_/i);
    expect(MIGRATION).not.toMatch(/customer_service_cards/);
  });

  it("revokes legacy open/close_cash_session from PUBLIC/anon/authenticated; keeps service_role", () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.open_cash_session\(integer, date, numeric, text\) FROM PUBLIC/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.open_cash_session\(integer, date, numeric, text\) FROM anon/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.open_cash_session\(integer, date, numeric, text\) FROM authenticated/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.open_cash_session\(integer, date, numeric, text\) TO service_role/,
    );

    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) FROM PUBLIC/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) FROM anon/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) FROM authenticated/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) TO service_role/,
    );
  });

  it("revokes authenticated INSERT on sales/sale_items and scopes magazzino insert policy to user_salons", () => {
    expect(MIGRATION).toMatch(/REVOKE INSERT ON TABLE public\.sales FROM authenticated/);
    expect(MIGRATION).toMatch(/REVOKE INSERT ON TABLE public\.sale_items FROM authenticated/);
    expect(MIGRATION).toMatch(/NOT public\.is_magazzino\(\)/);
    expect(MIGRATION).toMatch(/FROM public\.user_salons us/);
    expect(MIGRATION).toMatch(/us\.salon_id = sales\.salon_id/);
  });

  it("does not alter admin_close_cash_session / close_sale_atomic / close_cash_session_atomic", () => {
    expect(MIGRATION).not.toMatch(
      /(?:CREATE|REPLACE|REVOKE|GRANT|DROP).{0,80}admin_close_cash_session/i,
    );
    expect(MIGRATION).not.toMatch(
      /(?:CREATE|REPLACE|REVOKE|GRANT|DROP).{0,80}close_sale_atomic/i,
    );
    expect(MIGRATION).not.toMatch(
      /(?:CREATE|REPLACE|REVOKE|GRANT|DROP).{0,80}close_cash_session_atomic/i,
    );
  });
});

describe("P0 magazzino cash/sales PostgREST bypass (isolated Postgres)", () => {
  it(
    "blocks magazzino salon-1 RPC/INSERT; preserves service_role Next path",
    () => {
      const setup = join(ROOT, "scripts/auth/p0_cash_sales_bypass_isolated_setup.sql");
      const migration = join(ROOT, MIGRATION_PATH);
      const assertSql = join(
        ROOT,
        "scripts/auth/p0_cash_sales_bypass_isolated_assert.sql",
      );

      const name = `p0-cash-sales-${Date.now()}`;
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

        // wait ready
        let ready = false;
        for (let i = 0; i < 30; i++) {
          try {
            execFileSync(
              "docker",
              ["exec", name, "pg_isready", "-U", "postgres"],
              { stdio: ["ignore", "pipe", "pipe"] },
            );
            ready = true;
            break;
          } catch {
            execFileSync("sleep", ["1"]);
          }
        }
        expect(ready).toBe(true);

        const runFile = (path: string) => {
          const sql = readFileSync(path, "utf8");
          return execFileSync(
            "docker",
            ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
            { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
          );
        };

        runFile(setup);
        runFile(migration);
        const out = runFile(assertSql);
        expect(out).toMatch(/p0_cash_sales_bypass_isolated_assert: OK/);
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], {
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch {
          // ignore cleanup errors
        }
      }
    },
    120_000,
  );
});
