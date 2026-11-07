import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261107170000_admin_close_cash_session.sql",
  ),
  "utf8",
);

function functionBody(sql: string): string {
  const m = sql.match(/AS \$function\$([\s\S]*?)\$function\$/);
  if (!m) throw new Error("function body not found");
  return m[1];
}

describe("admin_close_cash_session migration (prepared)", () => {
  const body = functionBody(MIGRATION);

  it("requires coordinator JWT and explicit session id + reason", () => {
    expect(body).toMatch(/IF auth\.uid\(\) IS NULL THEN/);
    expect(body).toMatch(/IF public\.is_coordinator\(\) IS NOT TRUE THEN/);
    expect(body).toMatch(/p_cash_session_id/);
    expect(body).toMatch(/motivazione obbligatoria/);
    expect(body).toMatch(/FOR UPDATE/);
  });

  it("does not set closing_cash and does not create fiscal jobs", () => {
    expect(body).not.toMatch(/closing_cash\s*=/);
    expect(body).not.toMatch(/fiscal_print_jobs/);
    expect(body).not.toMatch(/z_report/);
    expect(body).toMatch(/status = 'closed'/);
    expect(body).toMatch(/closed_by = auth\.uid\(\)/);
    expect(body).toMatch(/admin_close:/);
  });

  it("revokes anon/PUBLIC and grants authenticated only", () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_close_cash_session\(bigint, text\) FROM PUBLIC/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_close_cash_session\(bigint, text\) FROM anon/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_close_cash_session\(bigint, text\) TO authenticated/,
    );
    expect(MIGRATION).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_close_cash_session\(bigint, text\) TO service_role/,
    );
  });
});
