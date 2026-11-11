import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION_PATH =
  "supabase/migrations/20261111150000_close_sale_atomic_appointment_idempotency.sql";
const MIGRATION = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

const CALL_SQL = `
SELECT sale_id::text, fiscal_print_job_id::text, reused_sale::text
FROM public.close_sale_atomic(
  1,
  NULL,
  20,
  'cash',
  0,
  '[{"kind":"product","ref_id":7,"quantity":1,"price":20,"discount":0}]'::jsonb,
  1,
  1,
  NULL,
  '11111111-1111-1111-1111-111111111111'::uuid,
  true,
  '{"printer_model":"FP81","printer_serial":"SN1"}'::jsonb,
  false
);
`;

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
}

function dockerPsqlAsync(container: string, sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || out || `psql exit ${code}`));
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

describe("close_sale_atomic appointment idempotency migration (static)", () => {
  it("reuses walk-in idempotency_key path for appointments", () => {
    expect(MIGRATION).toMatch(/appointment:' \|\| p_appointment_id::text/);
    expect(MIGRATION).toMatch(/FROM public\.appointments a/);
    expect(MIGRATION).toMatch(/FOR UPDATE/);
    expect(MIGRATION).toMatch(/reused_sale := true/);
    expect(MIGRATION).not.toMatch(
      /CASE WHEN p_appointment_id IS NULL THEN v_idempotency_key ELSE NULL END/,
    );
    expect(MIGRATION).not.toMatch(
      /IF p_appointment_id IS NULL AND v_idempotency_key IS NOT NULL THEN/,
    );
  });
});

describe("close_sale_atomic appointment idempotency (isolated Postgres)", () => {
  it(
    "replay and concurrent checkout share one sale/stock/job",
    async () => {
      const name = `cassa-appt-idem-${Date.now()}`;
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
          readFileSync(
            join(ROOT, "scripts/auth/close_sale_appointment_idempotency_setup.sql"),
            "utf8",
          ),
        );
        dockerPsql(name, MIGRATION);

        // Reset fixture between phases via truncate+reseed helpers inline
        const reset = `
          TRUNCATE public.sales, public.sale_items, public.stock_movements, public.fiscal_print_jobs RESTART IDENTITY CASCADE;
          UPDATE public.appointments SET sale_id = NULL, status = 'in_sala' WHERE id = 1;
          UPDATE public.product_stock SET quantity = 5 WHERE product_id = 7 AND salon_id = 1;
        `;

        // --- sequential replay ---
        dockerPsql(name, reset);
        const first = dockerPsql(name, CALL_SQL).trim().split("|");
        const second = dockerPsql(name, CALL_SQL).trim().split("|");
        expect(first[0]).toBe(second[0]);
        expect(["t", "true"]).toContain(second[2]);
        expect(dockerPsql(name, "SELECT count(*) FROM public.sales;").trim()).toBe("1");
        expect(
          dockerPsql(name, "SELECT count(*) FROM public.stock_movements;").trim(),
        ).toBe("1");
        expect(
          dockerPsql(name, "SELECT count(*) FROM public.fiscal_print_jobs;").trim(),
        ).toBe("1");
        expect(
          dockerPsql(name, "SELECT quantity::text FROM public.product_stock WHERE product_id=7;").trim(),
        ).toBe("4");

        // --- concurrent ---
        dockerPsql(name, reset);
        const delayedCall = `
          SELECT pg_sleep(0.05);
          ${CALL_SQL}
        `;
        const [a, b] = await Promise.all([
          dockerPsqlAsync(name, delayedCall),
          dockerPsqlAsync(name, delayedCall),
        ]);
        const rowA = a.trim().split("|");
        const rowB = b.trim().split("|");
        expect(rowA[0]).toBe(rowB[0]);
        const reusedFlags = [rowA[2], rowB[2]]
          .map((v) => (v === "t" || v === "true" ? "reused" : "fresh"))
          .sort()
          .join(",");
        expect(reusedFlags).toBe("fresh,reused");
        expect(dockerPsql(name, "SELECT count(*) FROM public.sales;").trim()).toBe("1");
        expect(
          dockerPsql(name, "SELECT count(*) FROM public.stock_movements;").trim(),
        ).toBe("1");
        expect(
          dockerPsql(name, "SELECT count(*) FROM public.fiscal_print_jobs;").trim(),
        ).toBe("1");
        expect(
          dockerPsql(name, "SELECT quantity::text FROM public.product_stock WHERE product_id=7;").trim(),
        ).toBe("4");
        expect(
          dockerPsql(name, "SELECT sale_id::text FROM public.appointments WHERE id=1;").trim(),
        ).toBe(rowA[0]);
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], {
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch {
          // ignore
        }
      }
    },
    120_000,
  );
});

describe("appointmentCheckoutIdempotencyKey", () => {
  it("matches RPC canonical key", async () => {
    const { appointmentCheckoutIdempotencyKey } = await import(
      "@/lib/cassa/appointmentCheckoutIdempotency"
    );
    expect(appointmentCheckoutIdempotencyKey(42)).toBe("appointment:42");
  });
});
