import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INVENTARIO_PAGE_SIZE,
  fetchInventarioCatalogPage,
  inventarioCatalogRange,
  parseInventarioCatalogRpc,
} from "./inventarioCatalog";

describe("parseInventarioCatalogRpc", () => {
  it("parses paginated RPC payload", () => {
    const parsed = parseInventarioCatalogRpc({
      rows: [
        {
          product_id: 1,
          name: "A",
          category: "Cat",
          barcode: "123",
          quantity: 2,
        },
      ],
      total_count: 120,
      sottoscorta_count: 5,
      page: 2,
      page_size: 50,
    });

    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.totalCount).toBe(120);
    expect(parsed?.pageCount).toBe(3);
    expect(parsed?.sottoscortaCount).toBe(5);
  });

  it("returns null for invalid payload", () => {
    expect(parseInventarioCatalogRpc(null)).toBeNull();
  });
});

describe("inventarioCatalogRange", () => {
  it("uses 50 per page by default", () => {
    expect(inventarioCatalogRange(1)).toEqual({ from: 0, to: INVENTARIO_PAGE_SIZE - 1 });
    expect(inventarioCatalogRange(2)).toEqual({
      from: INVENTARIO_PAGE_SIZE,
      to: INVENTARIO_PAGE_SIZE * 2 - 1,
    });
  });
});

describe("fetchInventarioCatalogPage", () => {
  it("passes trimmed barcode search to RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        rows: [
          {
            product_id: 2,
            name: "Prodotto",
            category: null,
            barcode: "8001234567890",
            quantity: 4,
          },
        ],
        total_count: 1,
        sottoscorta_count: 1,
        page: 1,
        page_size: 50,
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const page = await fetchInventarioCatalogPage(supabase, 1, {
      search: " 8001234567890 ",
      category: "",
      sottoscortaOnly: false,
      page: 1,
    });

    expect(rpc).toHaveBeenCalledWith("list_inventario_catalog", {
      p_salon_id: 1,
      p_search: "8001234567890",
      p_category: null,
      p_sottoscorta_only: false,
      p_page: 1,
      p_page_size: 50,
    });
    expect(page.rows[0]?.barcode).toBe("8001234567890");
  });
});
