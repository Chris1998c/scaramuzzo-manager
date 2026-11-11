import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261111190000_patch_appointment_service_lines_atomic.sql";

function dockerPsql(container: string, sql: string): string {
  const raw = execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK)\b/i.test(l))
    .join("\n")
    .trim();
}

describe("patch_appointment_service_lines_atomic (isolated Postgres)", () => {
  it(
    "sequential line updates leave first changed on second failure; RPC rolls back; success applies all",
    () => {
      const name = `appt-lines-atomic-${Date.now()}`;
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
            join(ROOT, "scripts/auth/patch_appointment_service_lines_atomic_setup.sql"),
            "utf8",
          ),
        );
        q(readFileSync(join(ROOT, MIGRATION), "utf8"));

        const apptId = q(`
          INSERT INTO public.appointments (salon_id, start_time, end_time, status)
          VALUES (1, '2026-11-12 10:00:00', '2026-11-12 10:50:00', 'scheduled')
          RETURNING id;
        `);

        const line1 = q(`
          INSERT INTO public.appointment_services
            (appointment_id, service_id, staff_id, start_time, duration_minutes)
          VALUES (${apptId}, 1, 56, '2026-11-12 10:00:00', 20)
          RETURNING id;
        `);
        const line2 = q(`
          INSERT INTO public.appointment_services
            (appointment_id, service_id, staff_id, start_time, duration_minutes)
          VALUES (${apptId}, 2, 56, '2026-11-12 10:20:00', 30)
          RETURNING id;
        `);

        const staffSnapshot = () =>
          q(`
            SELECT string_agg(id::text || '=' || coalesce(staff_id::text,'null'), ',' ORDER BY id)
            FROM public.appointment_services
            WHERE appointment_id = ${apptId};
          `);
        const startSnapshot = () =>
          q(`
            SELECT string_agg(id::text || '=' || to_char(start_time,'HH24:MI'), ',' ORDER BY id)
            FROM public.appointment_services
            WHERE appointment_id = ${apptId};
          `);

        expect(staffSnapshot()).toBe(`${line1}=56,${line2}=56`);
        expect(startSnapshot()).toBe(`${line1}=10:00,${line2}=10:20`);

        // --- Reproduce today's non-atomic UI/API path: sequential UPDATEs ---
        q(`UPDATE public.appointment_services SET staff_id = 70 WHERE id = ${line1};`);
        let sequentialFailed = false;
        try {
          // Simulate second-line conflict / permission failure after first write.
          q(`
            DO $$
            BEGIN
              RAISE EXCEPTION 'Collaboratore già impegnato in questa fascia oraria';
            END $$;
          `);
        } catch {
          sequentialFailed = true;
        }
        expect(sequentialFailed).toBe(true);
        // First line stays modified — exact defect under test.
        expect(staffSnapshot()).toBe(`${line1}=70,${line2}=56`);

        // Reset for atomic cases
        q(`
          UPDATE public.appointment_services SET staff_id = 56 WHERE appointment_id = ${apptId};
        `);
        expect(staffSnapshot()).toBe(`${line1}=56,${line2}=56`);

        // --- Atomic RPC: second line missing → full rollback ---
        let atomicFailed = false;
        try {
          q(`
            SELECT public.patch_appointment_service_lines_atomic(
              ${apptId},
              '[
                {"id": ${line1}, "staff_id": 70},
                {"id": 999999, "staff_id": 80}
              ]'::jsonb
            );
          `);
        } catch {
          atomicFailed = true;
        }
        expect(atomicFailed).toBe(true);
        expect(staffSnapshot()).toBe(`${line1}=56,${line2}=56`);

        // --- Atomic success: staff + contiguous time shift 20+30 ---
        q(`
          SELECT public.patch_appointment_service_lines_atomic(
            ${apptId},
            '[
              {"id": ${line1}, "staff_id": 70, "start_time": "2026-11-12T11:00:00"},
              {"id": ${line2}, "staff_id": 80, "start_time": "2026-11-12T11:20:00"}
            ]'::jsonb
          );
        `);
        expect(staffSnapshot()).toBe(`${line1}=70,${line2}=80`);
        expect(startSnapshot()).toBe(`${line1}=11:00,${line2}=11:20`);
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], {
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch {
          /* ignore */
        }
      }
    },
    90_000,
  );
});
