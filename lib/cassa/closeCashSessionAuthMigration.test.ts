import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261107160000_close_cash_session_auth_harden.sql",
  ),
  "utf8",
);

/** Corpo funzione tra AS $function$ … $function$ (unica definizione nella migration). */
function functionBody(sql: string): string {
  const m = sql.match(/AS \$function\$([\s\S]*?)\$function\$/);
  if (!m) throw new Error("function body not found");
  return m[1];
}

describe("close_cash_session auth harden migration", () => {
  const body = functionBody(MIGRATION);

  it("rejects anonymous / missing JWT (auth.uid() null)", () => {
    expect(body).toMatch(/IF auth\.uid\(\) IS NULL THEN/);
    expect(body).toMatch(
      /RAISE EXCEPTION 'close_cash_session: autenticazione richiesta'/,
    );
  });

  it("rejects user without salon access (can_access_salon IS NOT TRUE covers FALSE and NULL)", () => {
    expect(body).toMatch(
      /IF public\.can_access_salon\(p_salon_id\) IS NOT TRUE THEN/,
    );
    expect(body).toMatch(/RAISE EXCEPTION 'accesso negato al salone %'/);
    // Non usare il pattern debole IF NOT can_access_salon (bypass su NULL)
    expect(body).not.toMatch(
      /IF NOT public\.can_access_salon\(p_salon_id\) THEN/,
    );
  });

  it("authorized path keeps accounting close without fiscal jobs", () => {
    expect(body).toMatch(
      /v_diff := round\(p_closing_cash - \(coalesce\(v_opening, 0\) \+ v_expected_cash\), 2\);/,
    );
    expect(body).toMatch(/UPDATE public\.cash_sessions/);
    expect(body).toMatch(/status = 'closed'/);
    expect(body).toMatch(/closed_by = auth\.uid\(\)/);
    expect(body).not.toMatch(/fiscal_print_jobs/);
    expect(body).not.toMatch(/z_report/);
    expect(body).not.toMatch(/get_fiscal_profile/);
  });

  it("revokes EXECUTE from anon and PUBLIC; keeps authenticated and service_role", () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) FROM PUBLIC/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) FROM anon/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) TO authenticated/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.close_cash_session\(integer, date, numeric, text\) TO service_role/,
    );
  });
});
