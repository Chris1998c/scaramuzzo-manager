import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  romeBusinessDateFromUtcWall,
  utcWallBoundsForRomeBusinessDate,
} from "@/lib/datetime/romeBusinessDate";

const ROOT = process.cwd();
const SETUP = "scripts/auth/rome_business_date_setup.sql";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  ).trim();
}

describe("rome_business_date + overnight session (isolated Postgres)", () => {
  it(
    "mezzanotte CET/CEST: sale_day Rome ≠ date::date; sessione overnight su session_date",
    () => {
      const name = `rome-day-${Date.now()}`;
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

        // CET: before/after Rome midnight 2026-01-15
        q(`
          INSERT INTO sales (date, total_amount) VALUES
            ('2026-01-14 22:30:00', 10),  -- Rome 23:30 day 14
            ('2026-01-14 23:30:00', 20); -- Rome 00:30 day 15
        `);

        const cetNaive = q(`
          SELECT string_agg((date::date)::text, ',' ORDER BY id) FROM sales;
        `);
        const cetRome = q(`
          SELECT string_agg(rome_business_date(date)::text, ',' ORDER BY id) FROM sales;
        `);
        expect(cetNaive).toBe("2026-01-14,2026-01-14");
        expect(cetRome).toBe("2026-01-14,2026-01-15");
        expect(romeBusinessDateFromUtcWall("2026-01-14T23:30:00")).toBe("2026-01-15");

        // CEST: before/after Rome midnight 2026-07-15
        q(`DELETE FROM sales;
          INSERT INTO sales (date, total_amount) VALUES
            ('2026-07-14 21:30:00', 11),  -- Rome 23:30 day 14
            ('2026-07-14 22:30:00', 22); -- Rome 00:30 day 15
        `);
        const cestRome = q(`
          SELECT string_agg(rome_business_date(date)::text, ',' ORDER BY id) FROM sales;
        `);
        expect(cestRome).toBe("2026-07-14,2026-07-15");

        // Cassa day filter via UTC-wall bounds for Rome 2026-01-15
        const { startUtcWall, endUtcWallExclusive } =
          utcWallBoundsForRomeBusinessDate("2026-01-15");
        q(`DELETE FROM sales;
          INSERT INTO sales (date, total_amount) VALUES
            ('2026-01-14 22:30:00', 1),
            ('2026-01-14 23:30:00', 2),
            ('2026-01-15 22:59:00', 3),
            ('2026-01-15 23:00:00', 4);
        `);
        const inDay = q(`
          SELECT coalesce(sum(total_amount),0)::text FROM sales
          WHERE date >= '${startUtcWall.replace("T", " ").replace(/\.\d+$/, "")}'
            AND date < '${endUtcWallExclusive.replace("T", " ").replace(/\.\d+$/, "")}';
        `);
        // 23:30 day14-UTC (=Rome 15) + 22:59 day15-UTC (=Rome 15 23:59) = 2+3=5; exclude 22:30 and 23:00
        expect(Number(inDay)).toBe(5);

        // Overnight session: opened before midnight, closed after; session_date = open Rome day
        q(`
          INSERT INTO cash_sessions (session_date, opened_at, closed_at, status)
          VALUES (
            '2026-01-14',
            '2026-01-14 22:00:00',
            '2026-01-15 01:00:00',
            'closed'
          );
          INSERT INTO sales (cash_session_id, date, total_amount)
          SELECT id, '2026-01-14 23:30:00', 50 FROM cash_sessions ORDER BY id DESC LIMIT 1;
          INSERT INTO sales (cash_session_id, date, total_amount)
          SELECT id, '2026-01-14 22:00:00', 30 FROM cash_sessions ORDER BY id DESC LIMIT 1;
        `);

        const sessDate = q(`SELECT session_date::text FROM cash_sessions ORDER BY id DESC LIMIT 1`);
        expect(sessDate).toBe("2026-01-14");

        const sessGross = q(`
          SELECT coalesce(sum(total_amount),0)::text FROM sales
          WHERE cash_session_id = (SELECT id FROM cash_sessions ORDER BY id DESC LIMIT 1)
            AND status = 'posted';
        `);
        expect(Number(sessGross)).toBe(80);

        // Report day 15 includes post-midnight sale of that session; day 14 includes pre-midnight
        const r14 = q(`
          SELECT coalesce(sum(total_amount),0)::text FROM sales
          WHERE rome_business_date(date) = '2026-01-14' AND cash_session_id IS NOT NULL;
        `);
        const r15 = q(`
          SELECT coalesce(sum(total_amount),0)::text FROM sales
          WHERE rome_business_date(date) = '2026-01-15' AND cash_session_id IS NOT NULL;
        `);
        expect(Number(r14)).toBe(30);
        expect(Number(r15)).toBe(50);
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
