import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SETUP = "scripts/auth/customer_booking_concurrent_idempotency_setup.sql";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const CUST_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CUST_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function dockerPsql(container: string, sql: string, stopOnError = true): string {
  const raw = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      ...(stopOnError ? ["-v", "ON_ERROR_STOP=1"] : ["-v", "ON_ERROR_STOP=0"]),
      "-t",
      "-A",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return raw.trim();
}

function jsonOut(container: string, sql: string): Record<string, unknown> {
  const raw = dockerPsql(container, sql);
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .pop();
  if (!line) throw new Error(`No JSON from: ${sql}\n---\n${raw}`);
  return JSON.parse(line) as Record<string, unknown>;
}

describe("customer booking concurrent POST + idempotency (isolated Postgres)", () => {
  it(
    "due POST concorrenti → un solo appt + 409; complete fail → retry replay; payload diverso → 409",
    () => {
      const name = `cust-conc-${Date.now()}`;
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

        dockerPsql(name, readFileSync(join(ROOT, SETUP), "utf8"));
        dockerPsql(
          name,
          `
          INSERT INTO salons (id, name) VALUES (1, 'Nord');
          INSERT INTO customers (id, first_name) VALUES
            ('${CUST_A}', 'Alice'),
            ('${CUST_B}', 'Bob');
          INSERT INTO staff (id, salon_id) VALUES (10, 1);
          `,
        );

        // --- 1) Due POST concorrenti, clienti diversi, stesso staff/slot, key diverse ---
        const concurrent = execFileSync(
          "docker",
          [
            "exec",
            name,
            "bash",
            "-lc",
            `
set -e
psql -U postgres -v ON_ERROR_STOP=1 -t -A -c "SELECT sim_customer_booking_post('${USER_A}'::uuid,'${CUST_A}'::uuid,'key-A','hash-A',1,10,'2026-08-01 10:00:00'::timestamp,40,false);" > /tmp/rA.txt &
pidA=\$!
psql -U postgres -v ON_ERROR_STOP=1 -t -A -c "SELECT sim_customer_booking_post('${USER_B}'::uuid,'${CUST_B}'::uuid,'key-B','hash-B',1,10,'2026-08-01 10:00:00'::timestamp,40,false);" > /tmp/rB.txt &
pidB=\$!
wait \$pidA; wait \$pidB
echo '---A---'; cat /tmp/rA.txt
echo '---B---'; cat /tmp/rB.txt
`,
          ],
          { encoding: "utf8" },
        );

        const parseSide = (label: string): Record<string, unknown> => {
          const m = concurrent.match(new RegExp(`---${label}---\\n(\\{.*\\})`));
          expect(m?.[1], `missing JSON for ${label}: ${concurrent}`).toBeTruthy();
          return JSON.parse(m![1]!) as Record<string, unknown>;
        };
        const resA = parseSide("A");
        const resB = parseSide("B");

        const statuses = [resA.http_status, resB.http_status].map(Number).sort();
        // Assertion: un 201 e un 409
        expect(statuses).toEqual([201, 409]);

        const scheduled = dockerPsql(
          name,
          `SELECT count(*)::text FROM appointments WHERE status = 'scheduled';`,
        )
          .split("\n")
          .filter((l) => /^\d+$/.test(l.trim()))
          .pop();
        expect(scheduled).toBe("1");

        const orphanLines = dockerPsql(
          name,
          `
          SELECT count(*)::text
          FROM appointment_services s
          LEFT JOIN appointments a ON a.id = s.appointment_id
          WHERE a.id IS NULL;
          `,
        )
          .split("\n")
          .filter((l) => /^\d+$/.test(l.trim()))
          .pop();
        expect(orphanLines).toBe("0");

        const orphanHeaders = dockerPsql(
          name,
          `
          SELECT count(*)::text
          FROM appointments a
          WHERE a.status = 'scheduled'
            AND NOT EXISTS (
              SELECT 1 FROM appointment_services s WHERE s.appointment_id = a.id
            );
          `,
        )
          .split("\n")
          .filter((l) => /^\d+$/.test(l.trim()))
          .pop();
        expect(orphanHeaders).toBe("0");

        // Cleanup slot for idempotency scenarios
        dockerPsql(name, `DELETE FROM appointments; DELETE FROM customer_booking_idempotency_keys;`);

        // --- 2) Create ok + complete fail; retry stessa key/hash → stesso booking ---
        const first = jsonOut(
          name,
          `SELECT sim_customer_booking_post('${USER_A}'::uuid,'${CUST_A}'::uuid,'key-retry','hash-retry',1,10,'2026-08-02 11:00:00'::timestamp,40,true);`,
        );
        expect(first.http_status).toBe(201);
        expect(first.complete_failed).toBe(true);
        const bookingId = Number((first.booking as { id: number }).id);
        expect(bookingId).toBeGreaterThan(0);

        const keyStatus = dockerPsql(
          name,
          `SELECT status FROM customer_booking_idempotency_keys WHERE idempotency_key = 'key-retry';`,
        )
          .split("\n")
          .filter((l) => /^(processing|success|failed)$/.test(l.trim()))
          .pop();
        expect(keyStatus).toBe("processing");

        const retry = jsonOut(
          name,
          `SELECT sim_customer_booking_post('${USER_A}'::uuid,'${CUST_A}'::uuid,'key-retry','hash-retry',1,10,'2026-08-02 11:00:00'::timestamp,40,false);`,
        );
        expect(retry.http_status).toBe(201);
        expect(retry.replay).toBe(true);
        expect(Number((retry.booking as { id: number }).id)).toBe(bookingId);

        const afterRetryCount = dockerPsql(
          name,
          `SELECT count(*)::text FROM appointments WHERE customer_id = '${CUST_A}' AND status = 'scheduled';`,
        )
          .split("\n")
          .filter((l) => /^\d+$/.test(l.trim()))
          .pop();
        expect(afterRetryCount).toBe("1");

        const afterRetryKey = dockerPsql(
          name,
          `SELECT status FROM customer_booking_idempotency_keys WHERE idempotency_key = 'key-retry';`,
        )
          .split("\n")
          .filter((l) => /^(processing|success|failed)$/.test(l.trim()))
          .pop();
        expect(afterRetryKey).toBe("success");

        // --- 3) Stessa key, payload (hash) diverso → 409 ---
        const diffPayload = jsonOut(
          name,
          `SELECT sim_customer_booking_post('${USER_A}'::uuid,'${CUST_A}'::uuid,'key-retry','hash-DIFFERENT',1,10,'2026-08-02 15:00:00'::timestamp,40,false);`,
        );
        expect(diffPayload.http_status).toBe(409);
        expect(String(diffPayload.error)).toMatch(/payload diverso/i);
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
