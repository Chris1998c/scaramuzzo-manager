import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION_PATH =
  "supabase/migrations/20261116180000_appointment_cancel_audit_customer_app.sql";
const SETUP_PATH = "scripts/auth/appointment_cancel_audit_setup.sql";
const MIGRATION = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

const ACTOR = "11111111-1111-1111-1111-111111111111";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
}

describe("appointment cancel/hard_delete audit migration (static)", () => {
  it("blocca hard-delete customer_app e scrive system_log", () => {
    expect(MIGRATION).toMatch(/customer_app_no_hard_delete/);
    expect(MIGRATION).toMatch(/cancel_appointment_with_audit/);
    expect(MIGRATION).toMatch(/hard_delete_appointment_with_audit/);
    expect(MIGRATION).toMatch(/appointment_cancel/);
    expect(MIGRATION).toMatch(/appointment_hard_delete/);
    expect(MIGRATION).toMatch(/FOR UPDATE/);
  });
});

describe("appointment cancel/hard_delete audit (isolated Postgres)", () => {
  it(
    "soft-cancel customer_app preserva riga+servizi; hard-delete bloccato; ordinario cancellabile",
    async () => {
      const name = `appt-cancel-audit-${Date.now()}`;
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

        dockerPsql(name, readFileSync(join(ROOT, SETUP_PATH), "utf8"));
        dockerPsql(name, MIGRATION);

        dockerPsql(
          name,
          `
INSERT INTO public.appointments (id, salon_id, customer_id, status, source)
VALUES
  (142, 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'scheduled', 'customer_app'),
  (200, 1, NULL, 'scheduled', 'agenda');
INSERT INTO public.appointment_services (appointment_id, service_id, staff_id)
VALUES (142, 10, 3), (200, 11, 4);
`,
        );

        // Hard-delete customer_app → blocco; riga e servizi restano.
        const hardBlock = dockerPsql(
          name,
          `SELECT public.hard_delete_appointment_with_audit(142, '${ACTOR}'::uuid, 'test_hard');`,
        ).trim();
        expect(hardBlock).toContain("customer_app_no_hard_delete");
        expect(
          dockerPsql(name, `SELECT count(*) FROM public.appointments WHERE id=142;`).trim(),
        ).toBe("1");
        expect(
          dockerPsql(
            name,
            `SELECT count(*) FROM public.appointment_services WHERE appointment_id=142;`,
          ).trim(),
        ).toBe("1");

        // Soft-cancel customer_app → cancelled + audit; servizi preservati.
        const soft = dockerPsql(
          name,
          `SELECT public.cancel_appointment_with_audit(142, '${ACTOR}'::uuid, 'agenda_delete_soft_customer_app');`,
        ).trim();
        expect(soft).toContain('"ok": true');
        expect(soft).toContain("cancelled");
        expect(
          dockerPsql(name, `SELECT status FROM public.appointments WHERE id=142;`).trim(),
        ).toBe("cancelled");
        expect(
          dockerPsql(
            name,
            `SELECT count(*) FROM public.appointment_services WHERE appointment_id=142;`,
          ).trim(),
        ).toBe("1");
        expect(
          dockerPsql(
            name,
            `SELECT action FROM public.system_log WHERE reference_id='142' ORDER BY id DESC LIMIT 1;`,
          ).trim(),
        ).toBe("appointment_cancel");
        expect(
          dockerPsql(
            name,
            `SELECT payload->>'reason' FROM public.system_log WHERE reference_id='142' ORDER BY id DESC LIMIT 1;`,
          ).trim(),
        ).toBe("agenda_delete_soft_customer_app");

        // Soft-cancel già cancelled → terminal_status.
        const again = dockerPsql(
          name,
          `SELECT public.cancel_appointment_with_audit(142, '${ACTOR}'::uuid, 'again');`,
        ).trim();
        expect(again).toContain("terminal_status");

        // Ordinario agenda: hard-delete ok + audit.
        const hardOk = dockerPsql(
          name,
          `SELECT public.hard_delete_appointment_with_audit(200, '${ACTOR}'::uuid, 'agenda_hard_delete');`,
        ).trim();
        expect(hardOk).toContain('"ok": true');
        expect(
          dockerPsql(name, `SELECT count(*) FROM public.appointments WHERE id=200;`).trim(),
        ).toBe("0");
        expect(
          dockerPsql(
            name,
            `SELECT count(*) FROM public.appointment_services WHERE appointment_id=200;`,
          ).trim(),
        ).toBe("0");
        expect(
          dockerPsql(
            name,
            `SELECT action FROM public.system_log WHERE reference_id='200' ORDER BY id DESC LIMIT 1;`,
          ).trim(),
        ).toBe("appointment_hard_delete");
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], { stdio: ["ignore", "pipe", "pipe"] });
        } catch {
          /* ignore */
        }
      }
    },
    90_000,
  );
});
