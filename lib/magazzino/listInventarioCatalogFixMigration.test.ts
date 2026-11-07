import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FIX_SQL = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261107180000_fix_list_inventario_catalog_cte_scope.sql",
  ),
  "utf8",
);

describe("list_inventario_catalog CTE scope fix", () => {
  it("keeps base/filtered CTE references inside a single WITH statement", () => {
    expect(FIX_SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.list_inventario_catalog/);
    expect(FIX_SQL).toMatch(/WITH base AS \(/);
    expect(FIX_SQL).toMatch(/filtered AS \(/);
    expect(FIX_SQL).toMatch(/counted AS \(/);
    expect(FIX_SQL).toMatch(/page_rows AS \(/);
    // Anti-regression: no second statement that reopens base outside the WITH
    expect(FIX_SQL).not.toMatch(
      /SELECT count\(\*\)::bigint INTO v_sottoscorta FROM base/,
    );
    expect(FIX_SQL).not.toMatch(
      /INTO v_total FROM filtered;[\s\S]*SELECT count\(\*\)::bigint INTO v_sottoscorta FROM base/,
    );
  });

  it("uses IS NOT TRUE for can_access_salon (no NULL bypass)", () => {
    expect(FIX_SQL).toMatch(
      /IF public\.can_access_salon\(p_salon_id\) IS NOT TRUE THEN/,
    );
    expect(FIX_SQL).not.toMatch(/IF NOT public\.can_access_salon\(p_salon_id\) THEN/);
  });

  it("preserves name/barcode search and execute grants", () => {
    expect(FIX_SQL).toMatch(/p\.name ILIKE/);
    expect(FIX_SQL).toMatch(/p\.barcode ILIKE/);
    expect(FIX_SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.list_inventario_catalog\(\s*integer, text, text, boolean, integer, integer\s*\) TO authenticated, service_role/,
    );
  });
});
