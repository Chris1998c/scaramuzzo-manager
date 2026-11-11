import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RESOLVE_MIGRATION =
  "supabase/migrations/20261111180000_resolve_uncertain_fiscal_void.sql";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}

function lateCallbackSql(jobId: string, bridgeId: string): string {
  return `SELECT skipped_reason, already_finalized::text, new_job_status
    FROM public.finalize_fiscal_job_atomic(
      ${jobId},
      true,
      null,
      jsonb_build_object(
        'fiscal_receipt_number', '777',
        'z_rep_number', '88',
        'fiscal_receipt_date', '2026-11-11',
        'printer_serial', 'EPSON-LATE'
      ),
      '${bridgeId}'
    );`;
}

describe("resolve_uncertain_fiscal_void vs late void callback (isolated)", () => {
  it(
    "both orders: no second void doc, no second stock reverse, coherent sale status",
    () => {
      const name = `uncertain-void-race-${Date.now()}`;
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
        // Minimal upsert: if a late callback incorrectly proceeds, it would insert a doc.
        q(`
CREATE OR REPLACE FUNCTION public.upsert_fiscal_document_from_result(
  p_job public.fiscal_print_jobs,
  p_result jsonb,
  p_document_type text,
  p_sale_id bigint
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.fiscal_documents (
    salon_id, sale_id, fiscal_print_job_id, document_type,
    printer_serial, fiscal_receipt_number, fiscal_receipt_date, z_rep_number, raw_result
  ) VALUES (
    p_job.salon_id, p_sale_id, p_job.id, p_document_type,
    p_result->>'printer_serial', p_result->>'fiscal_receipt_number',
    p_result->>'fiscal_receipt_date', p_result->>'z_rep_number', p_result
  )
  ON CONFLICT (fiscal_print_job_id) DO UPDATE SET
    document_type = EXCLUDED.document_type,
    printer_serial = EXCLUDED.printer_serial,
    fiscal_receipt_number = EXCLUDED.fiscal_receipt_number,
    fiscal_receipt_date = EXCLUDED.fiscal_receipt_date,
    z_rep_number = EXCLUDED.z_rep_number,
    raw_result = EXCLUDED.raw_result;
END;
$$;`);
        q(
          readFileSync(
            join(ROOT, "scripts/auth/finalize_fiscal_job_atomic_live.sql"),
            "utf8",
          ),
        );
        q(readFileSync(join(ROOT, RESOLVE_MIGRATION), "utf8"));

        const actor = "33333333-3333-4333-8333-333333333333";
        const bridge = "bridge-late";

        function seedUncertain(qty: number, jobStatus: "cancelled" | "failed") {
          q(`INSERT INTO sales (salon_id, status, fiscal_status, void_reason)
             VALUES (1, 'fiscal_void_pending', 'printed', 'race-${jobStatus}');
             INSERT INTO sale_items (sale_id, product_id, quantity, price)
             SELECT id, 7, ${qty}, 10 FROM sales ORDER BY id DESC LIMIT 1;`);
          const saleId = q("SELECT id::text FROM sales ORDER BY id DESC LIMIT 1");
          q(`SELECT public.stock_move(7, ${qty}, 1, null, 'sale', 'Vendita #${saleId}',
            public.ledger_movement_group_from_text('sale-race:${saleId}'), ${saleId},
            null, null, null, null,
            public.ledger_movement_group_from_text('sale:${saleId}'), 'sale');`);
          q(`INSERT INTO fiscal_print_jobs (salon_id, kind, sale_id, status)
             VALUES (1, 'sale_receipt', ${saleId}, 'completed');`);
          const saleJob = q(
            `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${saleId} AND kind='sale_receipt' LIMIT 1`,
          );
          q(`INSERT INTO fiscal_documents (
               salon_id, sale_id, fiscal_print_job_id, document_type,
               printer_serial, fiscal_receipt_number, fiscal_receipt_date, z_rep_number
             ) VALUES (1, ${saleId}, ${saleJob}, 'sale_receipt', 'EPSON-R', '1', '2026-11-11', '1');`);
          q(`INSERT INTO fiscal_print_jobs (salon_id, created_by, kind, sale_id, status, locked_by, locked_at)
             VALUES (1, '${actor}'::uuid, 'void_receipt', ${saleId}, '${jobStatus}',
                     '${bridge}', now() - interval '15 minutes');`);
          const voidJob = q(
            `SELECT id::text FROM fiscal_print_jobs WHERE sale_id=${saleId} AND kind='void_receipt' ORDER BY id DESC LIMIT 1`,
          );
          return { saleId, voidJob };
        }

        function assertPrintedResolved(saleId: string, stockAfter: string) {
          expect(q(`SELECT status FROM sales WHERE id=${saleId}`)).toBe(
            "fiscally_voided",
          );
          expect(q(`SELECT fiscal_status FROM sales WHERE id=${saleId}`)).toBe(
            "voided",
          );
          expect(
            q(
              `SELECT count(*)::text FROM fiscal_documents WHERE sale_id=${saleId} AND document_type='void_receipt'`,
            ),
          ).toBe("1");
          expect(
            q(
              `SELECT count(*)::text FROM stock_movements WHERE sale_id=${saleId} AND source='void_reversal'`,
            ),
          ).toBe("1");
          expect(
            q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
          ).toBe(stockAfter);
        }

        // --- Order A: resolve void_printed THEN late callback (cancelled) ---
        const a = seedUncertain(2, "cancelled");
        const stockBeforeA = q(
          "SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7",
        );
        q(`SELECT public.resolve_uncertain_fiscal_void(
          ${a.saleId}, '${actor}'::uuid, 'void_printed',
          'Race A: annullo stampato verificato su registrazioni Epson',
          '501', '60', '2026-11-11', 'EPSON-R'
        );`);
        const cbA = q(lateCallbackSql(a.voidJob, bridge));
        expect(cbA).toMatch(/job_not_processing|t|true|cancelled/i);
        // job stays cancelled (not completed by late callback)
        expect(q(`SELECT status FROM fiscal_print_jobs WHERE id=${a.voidJob}`)).toBe(
          "cancelled",
        );
        assertPrintedResolved(a.saleId, String(Number(stockBeforeA) + 2));

        // --- Order B: late callback THEN resolve void_printed (cancelled) ---
        const b = seedUncertain(2, "cancelled");
        const stockBeforeB = q(
          "SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7",
        );
        const cbB = q(lateCallbackSql(b.voidJob, bridge));
        expect(cbB).toMatch(/job_not_processing/);
        expect(q(`SELECT status FROM fiscal_print_jobs WHERE id=${b.voidJob}`)).toBe(
          "cancelled",
        );
        expect(q(`SELECT status FROM sales WHERE id=${b.saleId}`)).toBe(
          "fiscal_void_pending",
        );
        expect(
          q(
            `SELECT count(*)::text FROM fiscal_documents WHERE sale_id=${b.saleId} AND document_type='void_receipt'`,
          ),
        ).toBe("0");
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${b.saleId} AND source='void_reversal'`,
          ),
        ).toBe("0");
        q(`SELECT public.resolve_uncertain_fiscal_void(
          ${b.saleId}, '${actor}'::uuid, 'void_printed',
          'Race B: annullo stampato verificato su registrazioni Epson',
          '502', '61', '2026-11-11', 'EPSON-R'
        );`);
        // Replay late callback after resolve
        q(lateCallbackSql(b.voidJob, bridge));
        assertPrintedResolved(b.saleId, String(Number(stockBeforeB) + 2));

        // --- failed job: late callback already_finalized; resolve still coherent ---
        const c = seedUncertain(1, "failed");
        const stockBeforeC = q(
          "SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7",
        );
        const cbC1 = q(lateCallbackSql(c.voidJob, bridge));
        expect(cbC1).toMatch(/t|true/); // already_finalized
        q(`SELECT public.resolve_uncertain_fiscal_void(
          ${c.saleId}, '${actor}'::uuid, 'void_printed',
          'Race C: failed job, annullo stampato su Epson',
          '503', '62', '2026-11-11', 'EPSON-R'
        );`);
        q(lateCallbackSql(c.voidJob, bridge));
        assertPrintedResolved(c.saleId, String(Number(stockBeforeC) + 1));

        // --- void_not_printed both orders: no void doc, no reverse ---
        const d = seedUncertain(1, "cancelled");
        const stockBeforeD = q(
          "SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7",
        );
        q(`SELECT public.resolve_uncertain_fiscal_void(
          ${d.saleId}, '${actor}'::uuid, 'void_not_printed',
          'Race D: assenza documento nelle registrazioni Epson'
        );`);
        q(lateCallbackSql(d.voidJob, bridge));
        expect(q(`SELECT status FROM sales WHERE id=${d.saleId}`)).toBe("posted");
        expect(q(`SELECT fiscal_status FROM sales WHERE id=${d.saleId}`)).toBe(
          "printed",
        );
        expect(
          q(
            `SELECT count(*)::text FROM fiscal_documents WHERE sale_id=${d.saleId} AND document_type='void_receipt'`,
          ),
        ).toBe("0");
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${d.saleId} AND source='void_reversal'`,
          ),
        ).toBe("0");
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe(stockBeforeD);

        const e = seedUncertain(1, "cancelled");
        const stockBeforeE = q(
          "SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7",
        );
        q(lateCallbackSql(e.voidJob, bridge));
        q(`SELECT public.resolve_uncertain_fiscal_void(
          ${e.saleId}, '${actor}'::uuid, 'void_not_printed',
          'Race E: assenza documento nelle registrazioni Epson'
        );`);
        q(lateCallbackSql(e.voidJob, bridge));
        expect(q(`SELECT status FROM sales WHERE id=${e.saleId}`)).toBe("posted");
        expect(
          q(
            `SELECT count(*)::text FROM fiscal_documents WHERE sale_id=${e.saleId} AND document_type='void_receipt'`,
          ),
        ).toBe("0");
        expect(
          q(
            `SELECT count(*)::text FROM stock_movements WHERE sale_id=${e.saleId} AND source='void_reversal'`,
          ),
        ).toBe("0");
        expect(
          q("SELECT quantity::text FROM product_stock WHERE salon_id=1 AND product_id=7"),
        ).toBe(stockBeforeE);
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
