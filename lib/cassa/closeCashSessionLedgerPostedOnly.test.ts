import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SETUP = "scripts/auth/close_cash_session_ledger_setup.sql";
const MIGRATION =
  "supabase/migrations/20261111194000_close_cash_session_ledger_posted_only.sql";

const ACTOR = "11111111-1111-1111-1111-111111111111";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  ).trim();
}

describe("close_cash_session ledger posted-only (isolated Postgres)", () => {
  it(
    "prima include void cash; dopo esclude void; nessun job fiscale; card fuori expected_cash",
    () => {
      const name = `close-cash-ledger-${Date.now()}`;
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
        q(readFileSync(join(ROOT, SETUP), "utf8"));

        q(`
          INSERT INTO cash_sessions (salon_id, session_date, opening_cash, status)
          VALUES (1, CURRENT_DATE, 100, 'open');
        `);
        const sessId = q(`SELECT id::text FROM cash_sessions ORDER BY id DESC LIMIT 1`);

        q(`
          INSERT INTO sales (salon_id, cash_session_id, total_amount, payment_method, status, operation_type)
          VALUES
            (1, ${sessId}, 50, 'cash', 'posted', 'sale'),
            (1, ${sessId}, 20, 'cash', 'fiscally_voided', 'sale'),
            (1, ${sessId}, 30, 'card', 'posted', 'sale');
        `);

        // --- BEFORE: void cash incluso → expected = 70, diff = closing - (100+70)
        const before = q(`
          SELECT r.cash_difference::text
          FROM (SELECT set_config('request.jwt.claim.sub', '${ACTOR}', true)) cfg
          CROSS JOIN LATERAL close_cash_session(1, CURRENT_DATE, 170, 'before') r;
        `);
        // 170 - (100 + 50 + 20) = 0
        expect(Number(before)).toBe(0);

        const jobsBefore = q(`SELECT count(*)::text FROM fiscal_print_jobs`);
        expect(Number(jobsBefore)).toBe(0);

        // Reopen for after-fix
        q(`
          UPDATE cash_sessions SET closed_at = NULL, closing_cash = NULL, status = 'open'
          WHERE id = ${sessId};
        `);

        q(readFileSync(join(ROOT, MIGRATION), "utf8"));

        // --- AFTER: void escluso → expected cash = 50, card non conta
        // closing 150 → diff = 150 - (100+50) = 0
        const after = q(`
          SELECT r.cash_difference::text
          FROM (SELECT set_config('request.jwt.claim.sub', '${ACTOR}', true)) cfg
          CROSS JOIN LATERAL close_cash_session(1, CURRENT_DATE, 150, 'after') r;
        `);
        expect(Number(after)).toBe(0);

        // Se void fosse ancora incluso, expected=70 → diff = 150-(100+70)= -20
        // Conferma esplicita sul totale cash posted-only
        const postedCash = q(`
          SELECT coalesce(sum(total_amount),0)::text FROM sales
          WHERE cash_session_id = ${sessId}
            AND payment_method = 'cash'
            AND status = 'posted'
            AND operation_type = 'sale';
        `);
        expect(Number(postedCash)).toBe(50);

        const postedCard = q(`
          SELECT coalesce(sum(total_amount),0)::text FROM sales
          WHERE cash_session_id = ${sessId}
            AND payment_method = 'card'
            AND status = 'posted'
            AND operation_type = 'sale';
        `);
        expect(Number(postedCard)).toBe(30);

        const postedTotal = q(`
          SELECT coalesce(sum(total_amount),0)::text FROM sales
          WHERE cash_session_id = ${sessId}
            AND status = 'posted'
            AND operation_type = 'sale';
        `);
        expect(Number(postedTotal)).toBe(80);

        const jobsAfter = q(`SELECT count(*)::text FROM fiscal_print_jobs`);
        expect(Number(jobsAfter)).toBe(0);

        const closed = q(`SELECT status FROM cash_sessions WHERE id = ${sessId}`);
        expect(closed).toBe("closed");

        // Grants: anon/authenticated no EXECUTE; service_role yes
        expect(
          q(`
            SELECT has_function_privilege(
              'anon',
              'public.close_cash_session(integer,date,numeric,text)',
              'EXECUTE'
            )::text;
          `),
        ).toBe("false");
        expect(
          q(`
            SELECT has_function_privilege(
              'authenticated',
              'public.close_cash_session(integer,date,numeric,text)',
              'EXECUTE'
            )::text;
          `),
        ).toBe("false");
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
        } catch {
          /* ignore */
        }
      }
    },
    90_000,
  );
});
