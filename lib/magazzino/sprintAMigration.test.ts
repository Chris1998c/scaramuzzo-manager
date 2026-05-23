import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SPRINT_A_SQL = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260530120000_magazzino_sprint_a_pre_ui_premium.sql",
  ),
  "utf8",
);

describe("Sprint A migration (RLS + inventario RPC)", () => {
  it("revokes client writes on transfers tables", () => {
    expect(SPRINT_A_SQL).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.transfers FROM anon, authenticated/,
    );
    expect(SPRINT_A_SQL).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.transfer_items FROM anon, authenticated/,
    );
  });

  it("drops obsolete transfer write policies", () => {
    expect(SPRINT_A_SQL).toMatch(/DROP POLICY IF EXISTS transfers_insert/);
    expect(SPRINT_A_SQL).toMatch(/DROP POLICY IF EXISTS transfer_items_delete/);
  });

  it("defines list_inventario_catalog with name and barcode search", () => {
    expect(SPRINT_A_SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.list_inventario_catalog/);
    expect(SPRINT_A_SQL).toMatch(/p\.name ILIKE/);
    expect(SPRINT_A_SQL).toMatch(/p\.barcode ILIKE/);
  });
});
