import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SETUP = "scripts/auth/report_cassa_reconciliation_setup.sql";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  ).trim();
}

describe("report/cassa void ledger (isolated Postgres)", () => {
  it(
    "posted incluso; fiscally_voided escluso da Σ total_amount (sessione chiusa)",
    () => {
      const name = `report-cassa-${Date.now()}`;
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
          INSERT INTO sales (cash_session_id, total_amount, discount, payment_method, status, operation_type)
          VALUES
            (100, 50, 0, 'cash', 'posted', 'sale'),
            (100, 80, 20, 'card', 'posted', 'sale'),
            (100, 1, 21, 'cash', 'fiscally_voided', 'sale');
        `);

        const posted = q(`
          SELECT coalesce(sum(total_amount),0)::text
          FROM sales
          WHERE cash_session_id = 100
            AND lower(status) = 'posted'
            AND lower(operation_type) = 'sale';
        `);
        const voided = q(`
          SELECT coalesce(sum(total_amount),0)::text
          FROM sales
          WHERE cash_session_id = 100
            AND lower(status) = 'fiscally_voided';
        `);
        const allCashLikeLegacy = q(`
          SELECT coalesce(sum(total_amount),0)::text
          FROM sales
          WHERE cash_session_id = 100
            AND lower(payment_method) = 'cash';
        `);

        expect(Number(posted)).toBe(130);
        expect(Number(voided)).toBe(1);
        // Legacy senza filtro status conterrebbe anche il void cash (51)
        expect(Number(allCashLikeLegacy)).toBe(51);
        // Regola UI/report: solo posted → cash 50
        const postedCash = q(`
          SELECT coalesce(sum(total_amount),0)::text
          FROM sales
          WHERE cash_session_id = 100
            AND lower(status) = 'posted'
            AND lower(operation_type) = 'sale'
            AND lower(payment_method) = 'cash';
        `);
        expect(Number(postedCash)).toBe(50);
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
        } catch {
          /* ignore */
        }
      }
    },
    60_000,
  );
});
