import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const M162 = "supabase/migrations/20261116162000_revoke_appointment_audit_rpc_execute.sql";
const M180 = "supabase/migrations/20261116180000_appointment_cancel_audit_customer_app.sql";
const M181 = "supabase/migrations/20261116180100_revoke_appointment_audit_rpc_execute_after_create.sql";

function dockerPsql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  ).trim();
}

describe("appointment audit RPC migration order (empty Postgres)", () => {
  it(
    "162000 no-op → 180000 create → 181000 final ACL only postgres+service_role",
    () => {
      const name = `appt-rpc-order-${Date.now()}`;
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

        // Minimal roles + schema like Supabase defaults that re-grant EXECUTE on CREATE.
        dockerPsql(
          name,
          `
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

CREATE TABLE public.users (id uuid PRIMARY KEY);
CREATE TABLE public.salons (id integer PRIMARY KEY);
CREATE TABLE public.appointments (
  id bigint PRIMARY KEY,
  salon_id integer NOT NULL REFERENCES public.salons(id),
  customer_id uuid,
  status text NOT NULL DEFAULT 'scheduled',
  source text,
  sale_id bigint,
  start_time timestamp without time zone,
  end_time timestamp without time zone
);
CREATE TABLE public.appointment_services (
  id bigserial PRIMARY KEY,
  appointment_id bigint NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE
);
CREATE TABLE public.system_log (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.users(id),
  salon_id integer REFERENCES public.salons(id),
  action text,
  table_name text,
  reference_id text,
  payload jsonb,
  created_at timestamp without time zone DEFAULT now()
);
`,
        );

        // 162000 must succeed with RPCs missing.
        dockerPsql(name, readFileSync(join(ROOT, M162), "utf8"));
        expect(
          dockerPsql(
            name,
            `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN ('cancel_appointment_with_audit','hard_delete_appointment_with_audit');`,
          ),
        ).toBe("0");

        dockerPsql(name, readFileSync(join(ROOT, M180), "utf8"));
        // After create, default privileges typically leave anon/authenticated EXECUTE.
        const mid = dockerPsql(
          name,
          `SELECT string_agg(p.proname || ':' || coalesce(p.proacl::text,'null'), ' | ' ORDER BY p.proname)
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
             AND p.proname IN ('cancel_appointment_with_audit','hard_delete_appointment_with_audit');`,
        );
        expect(mid).toContain("anon=X");
        expect(mid).toContain("authenticated=X");

        dockerPsql(name, readFileSync(join(ROOT, M181), "utf8"));

        const rows = dockerPsql(
          name,
          `SELECT p.proname
                  || '|acl=' || coalesce(p.proacl::text,'null')
                  || '|anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                  || '|auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                  || '|svc=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
             AND p.proname IN ('cancel_appointment_with_audit','hard_delete_appointment_with_audit')
           ORDER BY 1;`,
        ).split("\n");

        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row).toContain("acl={postgres=X/postgres,service_role=X/postgres}");
          expect(row).toContain("anon=false");
          expect(row).toContain("auth=false");
          expect(row).toContain("svc=true");
          expect(row).not.toContain("anon=X");
          expect(row).not.toContain("authenticated=X");
        }
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
