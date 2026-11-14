import { describe, expect, it, vi } from "vitest";

import { resolveAgendaServiceLines } from "@/lib/agenda/appointmentServerValidation";
import {
  agendaVisibilityBypassIdsForCustomerComposition,
  normalizeCustomerAppBookingServiceIds,
  type CustomerAppServiceCatalogRow,
} from "@/lib/customer-app/customerBookingServiceRules";

function mockAdmin(services: unknown[], prices: unknown[]) {
  const from = vi.fn((table: string) => {
    if (table === "services") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: services, error: null }),
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

const shampooRow = {
  id: 62,
  active: true,
  visible_in_agenda: false,
  duration: 10,
  duration_active: 10,
  duration_processing: 0,
  need_processing: false,
  vat_rate: 22,
};
const erbeRow = {
  id: 66,
  active: true,
  visible_in_agenda: true,
  duration: 40,
  duration_active: 40,
  duration_processing: 40,
  need_processing: true,
  vat_rate: 22,
};
const piegaRow = {
  id: 58,
  active: true,
  visible_in_agenda: true,
  duration: 45,
  duration_active: 45,
  duration_processing: 0,
  need_processing: false,
  vat_rate: 22,
};
const hiddenOther = {
  id: 999,
  active: true,
  visible_in_agenda: false,
  duration: 20,
  duration_active: 20,
  duration_processing: 0,
  need_processing: false,
  vat_rate: 22,
};

const compositionCatalog: CustomerAppServiceCatalogRow[] = [
  {
    id: 62,
    name: "Shampoo",
    category_name: "lavaggio",
    need_processing: false,
    visible_in_customer_app: false,
  },
  {
    id: 58,
    name: "Piega",
    category_name: "styling",
    need_processing: false,
    visible_in_customer_app: true,
  },
  {
    id: 66,
    name: "Erbe Botaniche",
    category_name: "erbe",
    need_processing: true,
    visible_in_customer_app: true,
  },
  {
    id: 64,
    name: "Colore Ossidazione",
    category_name: "colore",
    need_processing: true,
    visible_in_customer_app: true,
  },
  {
    id: 55,
    name: "Taglio Donna Scaramuzzo",
    category_name: "taglio",
    need_processing: false,
    visible_in_customer_app: true,
  },
];

describe("resolveAgendaServiceLines + companion composition", () => {
  it("senza bypass: Shampoo 62 (visible_in_agenda=false) → errore agenda", async () => {
    const admin = mockAdmin(
      [shampooRow, erbeRow, piegaRow],
      [
        { service_id: 62, price: 3 },
        { service_id: 66, price: 70 },
        { service_id: 58, price: 22 },
      ],
    );
    const resolved = await resolveAgendaServiceLines(admin, 1, [62, 66, 58]);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error).toContain("non visibile in agenda (id 62)");
    }
  });

  it("con bypass companion composizione: Erbe → resolve ok e totale €95", async () => {
    const normalized = normalizeCustomerAppBookingServiceIds(compositionCatalog, [66]);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const admin = mockAdmin(
      [shampooRow, erbeRow, piegaRow],
      [
        { service_id: 62, price: 3 },
        { service_id: 66, price: 70 },
        { service_id: 58, price: 22 },
      ],
    );
    const resolved = await resolveAgendaServiceLines(admin, 1, normalized.serviceIds, {
      allowWithoutAgendaVisibilityIds:
        agendaVisibilityBypassIdsForCustomerComposition(normalized),
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect([...resolved.data.keys()].sort((a, b) => a - b)).toEqual([58, 62, 66]);
    const total = normalized.serviceIds.reduce(
      (sum, id) => sum + (resolved.data.get(id)?.price ?? 0),
      0,
    );
    expect(total).toBe(95);
    expect(resolved.data.get(66)?.duration_minutes).toBe(80);
  });

  it("taglio donna e colore: stessa allowlist companion shampoo", () => {
    for (const primary of [55, 64]) {
      const normalized = normalizeCustomerAppBookingServiceIds(compositionCatalog, [
        primary,
      ]);
      expect(normalized.ok).toBe(true);
      if (!normalized.ok) continue;
      expect(normalized.serviceIds[0]).toBe(62);
      expect(normalized.companionIds).toEqual([62]);
      expect([...agendaVisibilityBypassIdsForCustomerComposition(normalized)]).toEqual([
        62,
      ]);
    }
  });

  it("servizio nascosto arbitrario non entra nella bypass anche se passato a resolve", async () => {
    const admin = mockAdmin(
      [hiddenOther, erbeRow],
      [
        { service_id: 999, price: 1 },
        { service_id: 66, price: 70 },
      ],
    );
    const resolved = await resolveAgendaServiceLines(admin, 1, [999, 66], {
      allowWithoutAgendaVisibilityIds: new Set([62]), // solo shampoo companion
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error).toContain("non visibile in agenda (id 999)");
    }
  });

  it("solo Shampoo e servizio nascosto restano rifiutati in normalize", () => {
    expect(normalizeCustomerAppBookingServiceIds(compositionCatalog, [62]).ok).toBe(
      false,
    );
    expect(
      normalizeCustomerAppBookingServiceIds(
        [
          ...compositionCatalog,
          {
            id: 999,
            name: "Nascosto",
            category_name: "altro",
            need_processing: false,
            visible_in_customer_app: false,
          },
        ],
        [999],
      ).ok,
    ).toBe(false);
  });
});
