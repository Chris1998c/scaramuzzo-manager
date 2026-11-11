import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SETUP = "scripts/auth/patch_appointment_service_lines_atomic_setup.sql";
const MIGRATION_V1 =
  "supabase/migrations/20261111190000_patch_appointment_service_lines_atomic.sql";
const MIGRATION_HARDEN =
  "supabase/migrations/20261111191000_patch_appointment_service_lines_atomic_harden.sql";

function dockerPsql(container: string, sql: string): string {
  const raw = execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK|REVOKE|GRANT|COMMENT)\b/i.test(l))
    .join("\n")
    .trim();
}

describe("patch_appointment_service_lines_atomic harden (isolated Postgres)", () => {
  it(
    "revokes anon/authenticated; rolls back header+lines on post-header failure; success applies both",
    () => {
      const name = `appt-lines-harden-${Date.now()}`;
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
        // customer_id uuid on appointments for header patch
        q(`ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS customer_id uuid;`);
        q(`ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS notes text;`);
        q(readFileSync(join(ROOT, MIGRATION_V1), "utf8"));
        // Simulate default-privilege leak then harden
        q(`
          GRANT EXECUTE ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb)
            TO anon, authenticated;
        `);
        q(readFileSync(join(ROOT, MIGRATION_HARDEN), "utf8"));

        const canExec = (role: string) =>
          q(`
            SELECT has_function_privilege(
              '${role}',
              'public.patch_appointment_service_lines_atomic(bigint,jsonb,jsonb)',
              'EXECUTE'
            )::text;
          `);

        expect(canExec("service_role")).toBe("true");
        expect(canExec("anon")).toBe("false");
        expect(canExec("authenticated")).toBe("false");

        // Direct call as anon must fail (permission denied)
        let anonDenied = false;
        try {
          q(`
            SET ROLE anon;
            SELECT public.patch_appointment_service_lines_atomic(
              1, '[{"id":1,"staff_id":1}]'::jsonb, NULL::jsonb
            );
            RESET ROLE;
          `);
        } catch (e) {
          anonDenied = /permission denied/i.test(String(e));
          try {
            q(`RESET ROLE;`);
          } catch {
            /* ignore */
          }
        }
        expect(anonDenied).toBe(true);

        const apptId = q(`
          INSERT INTO public.appointments (salon_id, start_time, end_time, status, notes)
          VALUES (1, '2026-11-12 10:00:00', '2026-11-12 10:50:00', 'scheduled', 'before')
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

        const snap = () =>
          q(`
            SELECT
              (SELECT notes || '|' || to_char(start_time,'HH24:MI') FROM appointments WHERE id=${apptId})
              || ';' ||
              (SELECT string_agg(
                 id::text || '=' || coalesce(staff_id::text,'null') || '@' || to_char(start_time,'HH24:MI'),
                 ',' ORDER BY id
               ) FROM appointment_services WHERE appointment_id=${apptId});
          `);

        const before = snap();
        expect(before).toContain("before|10:00");
        expect(before).toContain(`${line1}=56@10:00`);
        expect(before).toContain(`${line2}=56@10:20`);

        // Failure after lines would update but header invalid → full rollback
        let failed = false;
        try {
          q(`
            SELECT public.patch_appointment_service_lines_atomic(
              ${apptId},
              '[
                {"id": ${line1}, "staff_id": 70, "start_time": "2026-11-12T11:00:00"},
                {"id": ${line2}, "staff_id": 80, "start_time": "2026-11-12T11:20:00"}
              ]'::jsonb,
              '{"notes":"after","start_time":"not-a-timestamp","end_time":"2026-11-12T11:50:00","staff_id":70}'::jsonb
            );
          `);
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
        expect(snap()).toBe(before);

        // Success: lines + header together
        q(`
          SELECT public.patch_appointment_service_lines_atomic(
            ${apptId},
            '[
              {"id": ${line1}, "staff_id": 70, "start_time": "2026-11-12T11:00:00"},
              {"id": ${line2}, "staff_id": 80, "start_time": "2026-11-12T11:20:00"}
            ]'::jsonb,
            '{"notes":"after","start_time":"2026-11-12T11:00:00","end_time":"2026-11-12T11:50:00","staff_id":70}'::jsonb
          );
        `);
        const after = snap();
        expect(after).toContain("after|11:00");
        expect(after).toContain(`${line1}=70@11:00`);
        expect(after).toContain(`${line2}=80@11:20`);
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
