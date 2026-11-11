import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCHEDE_HISTORY_PAGE_SIZE,
  schedeHistoryHasMore,
  schedeHistoryRange,
} from "@/lib/customers/schedeTecnicheHistory";

const ROOT = process.cwd();

function dockerPsql(container: string, sql: string): string {
  const raw = execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  // Drop command tags like "INSERT 0 1" that can appear after RETURNING rows.
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT)\b/i.test(l))
    .join("\n")
    .trim();
}

describe("schede tecniche save/reopen (isolated Postgres)", () => {
  it(
    "inserts botanical card with appointment_id and reopens via paged history + latest botanicals",
    () => {
      const name = `schede-iso-${Date.now()}`;
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
        q(readFileSync(join(ROOT, "scripts/auth/schede_tecniche_isolated_setup.sql"), "utf8"));

        const customerId = q(
          `INSERT INTO public.customers (customer_code, first_name, last_name)
           VALUES ('ISO-SCHEDE-001', 'Iso', 'Botanica')
           RETURNING id;`,
        );
        expect(customerId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );

        // Seed 25 legacy notes so page-1 history is truncated (same page size as UI).
        q(`
          INSERT INTO public.customer_service_cards (customer_id, service_type, data, created_at)
          SELECT
            '${customerId}'::uuid,
            'legacy_note',
            jsonb_build_object(
              'source', 'boss',
              'original_text', 'legacy ' || g,
              'legacy_date', '2020-01-01'
            ),
            now() - (g || ' days')::interval
          FROM generate_series(1, 25) AS g;
        `);

        const payload = {
          kind: "botanicals",
          payload: {
            pre_direct: "Diretta 2",
            mix: "lawsonia + mallo",
            heat: "cuffia",
            processing_time: "60 min",
            rinse: "shampoo acido",
            rlp: "radice_lunghezze",
            goal: "copertura",
          },
          created_local: "2026-11-11T12:00:00.000Z",
        };

        const savedId = q(`
          INSERT INTO public.customer_service_cards (
            customer_id, service_type, data, salon_id, staff_id, appointment_id
          ) VALUES (
            '${customerId}'::uuid,
            'botanicals',
            '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb,
            1,
            57,
            141
          )
          RETURNING id;
        `);

        // Reopen path mirrors UI: first history page + dedicated latest botanicals.
        const modernRange = schedeHistoryRange(1);
        const legacyRange = schedeHistoryRange(1);

        const modernCount = Number(
          q(`
            SELECT count(*)::text FROM (
              SELECT id FROM public.customer_service_cards
              WHERE customer_id = '${customerId}'::uuid
                AND service_type <> 'legacy_note'
              ORDER BY created_at DESC
              OFFSET ${modernRange.from}
              LIMIT ${SCHEDE_HISTORY_PAGE_SIZE}
            ) t;
          `),
        );
        expect(modernCount).toBe(1);
        expect(schedeHistoryHasMore(modernCount)).toBe(false);

        const legacyPageCount = Number(
          q(`
            SELECT count(*)::text FROM (
              SELECT id FROM public.customer_service_cards
              WHERE customer_id = '${customerId}'::uuid
                AND service_type = 'legacy_note'
              ORDER BY created_at DESC
              OFFSET ${legacyRange.from}
              LIMIT ${SCHEDE_HISTORY_PAGE_SIZE}
            ) t;
          `),
        );
        expect(legacyPageCount).toBe(SCHEDE_HISTORY_PAGE_SIZE);
        expect(schedeHistoryHasMore(legacyPageCount)).toBe(true);

        const reopened = q(`
          SELECT
            id || '|' ||
            service_type || '|' ||
            coalesce(appointment_id::text, '') || '|' ||
            coalesce(data->'payload'->>'mix', '') || '|' ||
            coalesce(data->'payload'->>'rlp', '')
          FROM public.customer_service_cards
          WHERE customer_id = '${customerId}'::uuid
            AND service_type = 'botanicals'
          ORDER BY created_at DESC
          LIMIT 1;
        `);
        expect(reopened).toBe(
          `${savedId}|botanicals|141|lawsonia + mallo|radice_lunghezze`,
        );

        // Second page still reachable (full history consultable).
        const legacyPage2 = schedeHistoryRange(2);
        const legacyPage2Count = Number(
          q(`
            SELECT count(*)::text FROM (
              SELECT id FROM public.customer_service_cards
              WHERE customer_id = '${customerId}'::uuid
                AND service_type = 'legacy_note'
              ORDER BY created_at DESC
              OFFSET ${legacyPage2.from}
              LIMIT ${SCHEDE_HISTORY_PAGE_SIZE}
            ) t;
          `),
        );
        expect(legacyPage2Count).toBe(5);
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", name], {
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch {
          /* ignore cleanup errors */
        }
      }
    },
    90_000,
  );
});
