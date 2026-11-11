import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261111180000_resolve_uncertain_fiscal_void.sql";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}

describe("resolve_uncertain_fiscal_void migration (static)", () => {
  it("reconciles without auto-resend void; stock reverse only on void_printed", () => {
    const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
    expect(sql).toMatch(/void_printed/);
    expect(sql).toMatch(/void_not_printed/);
    expect(sql).toMatch(/fiscal_void_pending/);
    expect(sql).toMatch(/reverse_sale_stock_for_void/);
    expect(sql).toMatch(/manual_uncertain_void_resolve/);
    expect(sql).not.toMatch(/create_void_receipt_job/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*service_role/);
  });
});

describe("resolve_uncertain_fiscal_void (isolated Postgres)", () => {
  it(
    "void_not_printed restores; void_printed reverses stock idempotently; no Epson",
    () => {
      const name = `uncertain-void-${Date.now()}`;
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
        q(
          readFileSync(
            join(ROOT, "scripts/auth/resolve_uncertain_fiscal_void_setup.sql"),
            "utf8",
          ),
        );
        q(readFileSync(join(ROOT, "scripts/auth/stock_move_live.sql"), "utf8"));
        q(
          readFileSync(
            join(ROOT, "scripts/auth/reverse_sale_stock_for_void_live.sql"),
            "utf8",
          ),
        );
        q(readFileSync(join(ROOT, MIGRATION), "utf8"));

        const actor = "22222222-2222-4222-8222-222222222222";

        // --- Seed sale A: uncertain after cancelled processing void; stock already sold ---
        q(`INSERT INTO sales (salon_id, status, fiscal_status, void_reason)
           VALUES (1, 'fiscal_void_pending', 'printed', 'void-stale');
           INSERT INTO sale_items (sale_id, product_id, quantity, price)
           SELECT id, 7, 2, 10 FROM sales ORDER BY id DESC LIMIT 1;`);
        const saleNotPrinted = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
        q(`SELECT public.stock_move(7, 2, 1, null, 'sale', 'Vendita #${saleNotPrinted}',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, ${saleNotPrinted}, null, null, null, null,
          public.ledger_movement_group_from_text('sale:${saleNotPrinted}'), 'sale');`);
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe("8");

        q(`INSERT INTO fiscal_print_jobs (salon_id, kind, sale_id, status, created_at)
           VALUES (1, 'sale_receipt', ${saleNotPrinted}, 'completed', now() - interval '1 hour');`);
        const saleJobA = q(
          `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${saleNotPrinted} AND kind='sale_receipt' LIMIT 1`,
        );
        q(`INSERT INTO fiscal_documents (
             salon_id, sale_id, fiscal_print_job_id, document_type,
             printer_serial, fiscal_receipt_number, fiscal_receipt_date, z_rep_number
           ) VALUES (
             1, ${saleNotPrinted}, ${saleJobA}, 'sale_receipt',
             'EPSON-A', '100', '2026-11-11', '50'
           );`);
        q(`INSERT INTO fiscal_print_jobs (salon_id, kind, sale_id, status, locked_at, locked_by, created_at)
           VALUES (
             1, 'void_receipt', ${saleNotPrinted}, 'cancelled',
             now() - interval '20 minutes', 'bridge-1', now() - interval '25 minutes'
           );`);

        const rNot = q(`SELECT public.resolve_uncertain_fiscal_void(
          ${saleNotPrinted},
          '${actor}'::uuid,
          'void_not_printed',
          'Verificato: nessun scontrino di annullo uscito dalla Epson'
        )::text;`);
        expect(rNot).toMatch(/"ok":\s*true/);
        expect(rNot).toMatch(/"stock_reversed":\s*false/);
        expect(q(`SELECT status FROM sales WHERE id=${saleNotPrinted}`)).toBe("posted");
        expect(q(`SELECT fiscal_status FROM sales WHERE id=${saleNotPrinted}`)).toBe(
          "printed",
        );
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe("8");
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${saleNotPrinted} AND source='void_reversal'`,
          ),
        ).toBe("0");
        expect(
          q(
            `SELECT count(*)::text FROM fiscal_documents WHERE sale_id=${saleNotPrinted} AND document_type='void_receipt'`,
          ),
        ).toBe("0");

        // Idempotent replay
        const rNot2 = q(`SELECT public.resolve_uncertain_fiscal_void(
          ${saleNotPrinted},
          '${actor}'::uuid,
          'void_not_printed',
          'Verificato: nessun scontrino di annullo uscito dalla Epson'
        )::text;`);
        expect(rNot2).toMatch(/"idempotent":\s*true/);
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe("8");

        // --- Seed sale B: void_printed path with stock reverse + idempotency ---
        q(`INSERT INTO sales (salon_id, status, fiscal_status, void_reason)
           VALUES (1, 'fiscal_void_pending', 'printed', 'void-stale-printed');
           INSERT INTO sale_items (sale_id, product_id, quantity, price)
           SELECT id, 7, 3, 10 FROM sales ORDER BY id DESC LIMIT 1;`);
        const salePrinted = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
        q(`SELECT public.stock_move(7, 3, 1, null, 'sale', 'Vendita #${salePrinted}',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid, ${salePrinted}, null, null, null, null,
          public.ledger_movement_group_from_text('sale:${salePrinted}'), 'sale');`);
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe("5");

        q(`INSERT INTO fiscal_print_jobs (salon_id, kind, sale_id, status)
           VALUES (1, 'sale_receipt', ${salePrinted}, 'completed');`);
        const saleJobB = q(
          `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${salePrinted} AND kind='sale_receipt' LIMIT 1`,
        );
        q(`INSERT INTO fiscal_documents (
             salon_id, sale_id, fiscal_print_job_id, document_type,
             printer_serial, fiscal_receipt_number, fiscal_receipt_date, z_rep_number
           ) VALUES (
             1, ${salePrinted}, ${saleJobB}, 'sale_receipt',
             'EPSON-B', '200', '2026-11-11', '51'
           );`);
        q(`INSERT INTO fiscal_print_jobs (salon_id, kind, sale_id, status)
           VALUES (1, 'void_receipt', ${salePrinted}, 'cancelled');`);

        // Missing Epson coords → refuse (no stock change)
        let missingCoords = false;
        try {
          q(`SELECT public.resolve_uncertain_fiscal_void(
            ${salePrinted},
            '${actor}'::uuid,
            'void_printed',
            'Ho visto lo scontrino di annullo sulla Epson'
          );`);
        } catch {
          missingCoords = true;
        }
        expect(missingCoords).toBe(true);
        expect(q(`SELECT status FROM sales WHERE id=${salePrinted}`)).toBe(
          "fiscal_void_pending",
        );
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe("5");

        const rPrinted = q(`SELECT public.resolve_uncertain_fiscal_void(
          ${salePrinted},
          '${actor}'::uuid,
          'void_printed',
          'Annullo stampato: letto scontrino dalla Epson',
          '901',
          '52',
          '2026-11-11',
          'EPSON-B'
        )::text;`);
        expect(rPrinted).toMatch(/"ok":\s*true/);
        expect(rPrinted).toMatch(/"stock_reversed":\s*true/);
        expect(q(`SELECT status FROM sales WHERE id=${salePrinted}`)).toBe(
          "fiscally_voided",
        );
        expect(q(`SELECT fiscal_status FROM sales WHERE id=${salePrinted}`)).toBe(
          "voided",
        );
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe("8");
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${salePrinted} AND source='void_reversal'`,
          ),
        ).toBe("1");
        expect(
          q(
            `SELECT fiscal_receipt_number FROM fiscal_documents WHERE sale_id=${salePrinted} AND document_type='void_receipt' LIMIT 1`,
          ),
        ).toBe("901");
        expect(
          q(
            `SELECT raw_result->>'source' FROM fiscal_documents WHERE sale_id=${salePrinted} AND document_type='void_receipt' LIMIT 1`,
          ),
        ).toBe("manual_uncertain_void_resolve");

        // Idempotent: second resolve does not double-stock
        const rPrinted2 = q(`SELECT public.resolve_uncertain_fiscal_void(
          ${salePrinted},
          '${actor}'::uuid,
          'void_printed',
          'Annullo stampato: letto scontrino dalla Epson',
          '901',
          '52',
          '2026-11-11',
          'EPSON-B'
        )::text;`);
        expect(rPrinted2).toMatch(/"idempotent":\s*true/);
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe("8");
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${salePrinted} AND source='void_reversal'`,
          ),
        ).toBe("1");

        // Active void_receipt still pending/processing → blocked
        q(`INSERT INTO sales (salon_id, status, fiscal_status)
           VALUES (1, 'fiscal_void_pending', 'printed');`);
        const saleActive = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
        q(`INSERT INTO fiscal_print_jobs (salon_id, kind, sale_id, status)
           VALUES (1, 'void_receipt', ${saleActive}, 'processing');`);
        let blockedActive = false;
        try {
          q(`SELECT public.resolve_uncertain_fiscal_void(
            ${saleActive},
            '${actor}'::uuid,
            'void_not_printed',
            'Non dovrebbe passare con job ancora attivo'
          );`);
        } catch {
          blockedActive = true;
        }
        expect(blockedActive).toBe(true);
        expect(q(`SELECT status FROM sales WHERE id=${saleActive}`)).toBe(
          "fiscal_void_pending",
        );
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
