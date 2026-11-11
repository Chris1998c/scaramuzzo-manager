import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261111170000_cancel_void_receipt_restore_only_pending.sql";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  ).trim();
}

describe("cancel_void_receipt restore-only-pending migration (static)", () => {
  it("restores sale ledger only when prior status was pending", () => {
    const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
    expect(sql).toMatch(/AND v_status = 'pending'/);
    expect(sql).toMatch(/v_kind = 'void_receipt'/);
    expect(sql).toMatch(/fiscal_void_pending/);
    expect(sql).not.toMatch(/PERFORM public\.reverse_sale_stock_for_void/);
  });
});

describe("cancel void_receipt safety (isolated Postgres)", () => {
  it(
    "pending restores; processing stale blocks second void; completed refused",
    () => {
      const name = `void-cancel-safe-${Date.now()}`;
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
        q(readFileSync(join(ROOT, "scripts/auth/cancel_void_receipt_safety_setup.sql"), "utf8"));
        q(readFileSync(join(ROOT, MIGRATION), "utf8"));

        const actor = "11111111-1111-1111-1111-111111111111";

        // --- pending: restore + second void allowed ---
        q(`INSERT INTO sales (status, fiscal_status) VALUES ('posted', 'printed');`);
        const salePending = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
        q(`UPDATE sales SET status='fiscal_void_pending' WHERE id=${salePending};
           INSERT INTO fiscal_print_jobs (kind, sale_id, status, created_at)
           VALUES ('void_receipt', ${salePending}, 'pending', now());`);
        const jobPending = q(
          `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${salePending} ORDER BY id DESC LIMIT 1`,
        );
        q(`SELECT id FROM cancel_fiscal_print_job(${jobPending}, 'pending-test');`);
        expect(q(`SELECT status FROM sales WHERE id=${salePending}`)).toBe("posted");
        expect(q(`SELECT fiscal_status FROM sales WHERE id=${salePending}`)).toBe("printed");
        expect(q(`SELECT status FROM fiscal_print_jobs WHERE id=${jobPending}`)).toBe("cancelled");
        // second void can be queued (never sent to printer)
        q(`SELECT job_id FROM create_void_receipt_job_atomic(${salePending}, '${actor}'::uuid, 'retry');`);
        expect(q(`SELECT status FROM sales WHERE id=${salePending}`)).toBe("fiscal_void_pending");

        // --- processing stale (SOAP-sent simulation): cancel job, NO ledger restore ---
        q(`INSERT INTO sales (status, fiscal_status) VALUES ('posted', 'printed');`);
        const saleProc = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
        q(`UPDATE sales SET status='fiscal_void_pending' WHERE id=${saleProc};
           INSERT INTO fiscal_print_jobs (kind, sale_id, status, locked_at, locked_by, created_at)
           VALUES (
             'void_receipt', ${saleProc}, 'processing',
             now() - interval '20 minutes', 'bridge-1', now() - interval '25 minutes'
           );`);
        const jobProc = q(
          `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${saleProc} ORDER BY id DESC LIMIT 1`,
        );
        q(`SELECT id FROM cancel_fiscal_print_job(${jobProc}, 'stale-processing');`);
        expect(q(`SELECT status FROM fiscal_print_jobs WHERE id=${jobProc}`)).toBe("cancelled");
        expect(q(`SELECT status FROM sales WHERE id=${saleProc}`)).toBe("fiscal_void_pending");
        expect(q(`SELECT fiscal_status FROM sales WHERE id=${saleProc}`)).toBe("printed");
        // second automatic void must fail (sale not posted)
        let secondVoidBlocked = false;
        try {
          q(
            `SELECT job_id FROM create_void_receipt_job_atomic(${saleProc}, '${actor}'::uuid, 'double');`,
          );
        } catch {
          secondVoidBlocked = true;
        }
        expect(secondVoidBlocked).toBe(true);
        expect(
          q(
            `SELECT count(*)::text FROM fiscal_print_jobs WHERE sale_id=${saleProc} AND status='pending'`,
          ),
        ).toBe("0");

        // --- completed: cancel refused ---
        q(`INSERT INTO sales (status, fiscal_status) VALUES ('fiscally_voided', 'voided');`);
        const saleDone = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
        q(`INSERT INTO fiscal_print_jobs (kind, sale_id, status)
           VALUES ('void_receipt', ${saleDone}, 'completed');`);
        const jobDone = q(
          `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${saleDone} ORDER BY id DESC LIMIT 1`,
        );
        let completedBlocked = false;
        try {
          q(`SELECT id FROM cancel_fiscal_print_job(${jobDone}, 'nope');`);
        } catch {
          completedBlocked = true;
        }
        expect(completedBlocked).toBe(true);
        expect(q(`SELECT status FROM fiscal_print_jobs WHERE id=${jobDone}`)).toBe("completed");
        expect(q(`SELECT status FROM sales WHERE id=${saleDone}`)).toBe("fiscally_voided");
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], { stdio: ["ignore", "pipe", "pipe"] });
        } catch {
          // ignore
        }
      }
    },
    120_000,
  );
});
