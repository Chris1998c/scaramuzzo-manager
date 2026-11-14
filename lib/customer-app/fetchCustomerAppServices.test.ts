import { describe, expect, it, vi } from "vitest";

import {
  fetchCustomerAppServices,
  fetchCustomerAppServicesPayload,
} from "./fetchCustomerAppServices";

function mockAdmin(visible: unknown[], hidden: unknown[], prices: unknown[]) {
  let servicesCalls = 0;
  const from = vi.fn((table: string) => {
    if (table === "services") {
      servicesCalls += 1;
      const data = servicesCalls === 1 ? visible : hidden;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data, error: null }),
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
          duration_active: 30,
          duration_processing: 0,
          need_processing: false,
          color_code: null,
          service_categories: { name: "Taglio" },
        },
        {
          id: 1,
          name: "Alfa",
          category_id: 1,
          duration: 45,
          duration_active: 45,
          duration_processing: 0,
          need_processing: false,
          color_code: "#fff",
          service_categories: { name: "Taglio" },
        },
        {
          id: 3,
          name: "Senza prezzo",
          category_id: 1,
          duration: 30,
          duration_active: 30,
          duration_processing: 0,
          need_processing: false,
          color_code: null,
          service_categories: { name: "Taglio" },
        },
      ],
      [],
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

  it("espone Shampoo come companion non selezionabile, non nel catalogo", async () => {
    const admin = mockAdmin(
      [
        {
          id: 66,
          name: "Erbe Botaniche",
          category_id: 3,
          duration: 40,
          duration_active: 40,
          duration_processing: 40,
          need_processing: true,
          color_code: null,
          service_categories: { name: "erbe" },
        },
      ],
      [
        {
          id: 62,
          name: "Shampoo",
          category_id: 1,
          duration: 10,
          duration_active: 10,
          duration_processing: 0,
          need_processing: false,
          color_code: null,
          service_categories: { name: "lavaggio" },
        },
      ],
      [
        { service_id: 66, price: 70 },
        { service_id: 62, price: 3 },
      ],
    );

    const payload = await fetchCustomerAppServicesPayload(admin, 1);
    expect(payload.services.map((s) => s.id)).toEqual([66]);
    expect(payload.services[0]?.selectable).toBe(true);
    expect(payload.services[0]?.duration).toBe(80);
    expect(payload.companions).toHaveLength(1);
    expect(payload.companions[0]?.id).toBe(62);
    expect(payload.companions[0]?.selectable).toBe(false);
    expect(payload.companions[0]?.price).toBe(3);
  });
});
