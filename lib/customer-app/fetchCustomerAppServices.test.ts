import { describe, expect, it, vi } from "vitest";

import { fetchCustomerAppServices } from "./fetchCustomerAppServices";

function mockAdmin(services: unknown[], prices: unknown[]) {
  const from = vi.fn((table: string) => {
    if (table === "services") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: services, error: null }),
          }),
        }),
      };
    }
    if (table === "service_prices") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: prices, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as never;
}

describe("fetchCustomerAppServices", () => {
  it("esclude servizi senza prezzo salone e ordina per categoria", async () => {
    const admin = mockAdmin(
      [
        {
          id: 2,
          name: "Zeta",
          category_id: 1,
          duration: 30,
          color_code: null,
          service_categories: { name: "Taglio" },
        },
        {
          id: 1,
          name: "Alfa",
          category_id: 1,
          duration: 45,
          color_code: "#fff",
          service_categories: { name: "Taglio" },
        },
        {
          id: 3,
          name: "Senza prezzo",
          category_id: 1,
          duration: 30,
          color_code: null,
          service_categories: { name: "Taglio" },
        },
      ],
      [
        { service_id: 1, price: 25 },
        { service_id: 2, price: 15 },
      ],
    );

    const rows = await fetchCustomerAppServices(admin, 1);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].price).toBe(25);
    expect(rows[1].id).toBe(2);
    expect(rows.map((r) => r.id)).not.toContain(3);
  });
});
