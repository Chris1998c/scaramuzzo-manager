import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { nextAttendancePunchType } from "@/lib/mobile/mobileAttendanceClockInsert";

const ROOT = process.cwd();
const SETUP = "scripts/auth/mobile_attendance_clock_insert_setup.sql";
const MIGRATION =
  "supabase/migrations/20261111192000_mobile_attendance_clock_insert.sql";

function dockerPsql(container: string, sql: string): string {
  const raw = execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(INSERT|UPDATE|DELETE|SELECT|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK|REVOKE|GRANT|COMMENT|DO)\b/i.test(
          l,
        ),
    )
    .join("\n")
    .trim();
}

describe("nextAttendancePunchType", () => {
  it("toggla in↔out; prima timbratura = in", () => {
    expect(nextAttendancePunchType(null)).toBe("in");
    expect(nextAttendancePunchType(undefined)).toBe("in");
    expect(nextAttendancePunchType("out")).toBe("in");
    expect(nextAttendancePunchType("in")).toBe("out");
  });
});

describe("mobile_attendance_clock_insert (isolated Postgres, due sedi)", () => {
  it(
    "race legacy produce doppio in; RPC serializza e rifiuta too_soon; staff B isolato",
    () => {
      const name = `mobile-clock-${Date.now()}`;
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
        q(readFileSync(join(ROOT, MIGRATION), "utf8"));

        q(`
          INSERT INTO public.salons (id, name) VALUES (1, 'Sede Nord'), (2, 'Sede Sud');
          INSERT INTO public.staff (id, salon_id) VALUES (101, 1), (202, 2);
        `);

        // --- Legacy race (read last → insert) senza lock: due sessioni → 2× in ---
        q(`
          CREATE OR REPLACE FUNCTION public.legacy_clock_race(p_staff_id integer, p_salon_id integer)
          RETURNS void LANGUAGE plpgsql AS $$
          DECLARE v_last text; v_new text;
          BEGIN
            PERFORM pg_sleep(0.05);
            SELECT type INTO v_last FROM attendance_logs
              WHERE staff_id = p_staff_id ORDER BY created_at DESC, id DESC LIMIT 1;
            v_new := CASE WHEN v_last = 'in' THEN 'out' ELSE 'in' END;
            INSERT INTO attendance_logs (staff_id, salon_id, type) VALUES (p_staff_id, p_salon_id, v_new);
          END $$;
        `);

        // Parallel: two backends without advisory lock
        const raceOut = execFileSync(
          "docker",
          [
            "exec",
            name,
            "bash",
            "-lc",
            `psql -U postgres -v ON_ERROR_STOP=1 -c "SELECT legacy_clock_race(101,1);" &
             psql -U postgres -v ON_ERROR_STOP=1 -c "SELECT legacy_clock_race(101,1);" &
             wait`,
          ],
          { encoding: "utf8" },
        );
        expect(raceOut).toBeTruthy();

        const legacyCount = q(`
          SELECT count(*)::text FROM attendance_logs WHERE staff_id = 101 AND type = 'in';
        `);
        expect(Number(legacyCount)).toBeGreaterThanOrEqual(2);

        q(`DELETE FROM attendance_logs WHERE staff_id = 101;`);

        // --- RPC concurrent: al più una riga; seconda troppo presto ---
        const rpcRace = execFileSync(
          "docker",
          [
            "exec",
            name,
            "bash",
            "-lc",
            `psql -U postgres -v ON_ERROR_STOP=0 -c "SELECT mobile_attendance_clock_insert(101,1,45.0,9.0,NULL,NULL,NULL,15);" > /tmp/c1.txt 2>&1 &
             psql -U postgres -v ON_ERROR_STOP=0 -c "SELECT mobile_attendance_clock_insert(101,1,45.0,9.0,NULL,NULL,NULL,15);" > /tmp/c2.txt 2>&1 &
             wait
             cat /tmp/c1.txt /tmp/c2.txt`,
          ],
          { encoding: "utf8" },
        );
        expect(rpcRace).toMatch(/in|troppo presto|too_soon/);

        const rpcCount = q(`SELECT count(*)::text FROM attendance_logs WHERE staff_id = 101;`);
        expect(Number(rpcCount)).toBe(1);
        const rpcType = q(`SELECT type FROM attendance_logs WHERE staff_id = 101;`);
        expect(rpcType).toBe("in");

        // Immediate second punch rejected
        let tooSoon = "";
        try {
          tooSoon = execFileSync(
            "docker",
            [
              "exec",
              "-i",
              name,
              "psql",
              "-U",
              "postgres",
              "-v",
              "ON_ERROR_STOP=1",
              "-t",
              "-A",
            ],
            {
              input: `SELECT mobile_attendance_clock_insert(101,1,45.0,9.0,NULL,NULL,NULL,15);`,
              encoding: "utf8",
            },
          );
        } catch (e) {
          const err = e as { stderr?: string; stdout?: string; message?: string };
          tooSoon = `${err.stderr ?? ""}\n${err.stdout ?? ""}\n${err.message ?? ""}`;
        }
        expect(tooSoon).toMatch(/troppo presto|too_soon/);

        // Staff B (sede diversa) non tocca i log di A
        q(`SELECT mobile_attendance_clock_insert(202,2,44.0,8.0,NULL,NULL,NULL,0);`);
        const aCount = q(`SELECT count(*)::text FROM attendance_logs WHERE staff_id = 101;`);
        const bCount = q(`SELECT count(*)::text FROM attendance_logs WHERE staff_id = 202;`);
        const bSalon = q(`SELECT salon_id::text FROM attendance_logs WHERE staff_id = 202;`);
        expect(Number(aCount)).toBe(1);
        expect(Number(bCount)).toBe(1);
        expect(bSalon).toBe("2");

        // Grants: anon/authenticated denied
        const anonX = q(`
          SELECT has_function_privilege(
            'anon',
            'public.mobile_attendance_clock_insert(integer,integer,numeric,numeric,numeric,text,text,integer)',
            'EXECUTE'
          )::text;
        `);
        const authX = q(`
          SELECT has_function_privilege(
            'authenticated',
            'public.mobile_attendance_clock_insert(integer,integer,numeric,numeric,numeric,text,text,integer)',
            'EXECUTE'
          )::text;
        `);
        const svcX = q(`
          SELECT has_function_privilege(
            'service_role',
            'public.mobile_attendance_clock_insert(integer,integer,numeric,numeric,numeric,text,text,integer)',
            'EXECUTE'
          )::text;
        `);
        expect(anonX).toBe("false");
        expect(authX).toBe("false");
        expect(svcX).toBe("true");
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
