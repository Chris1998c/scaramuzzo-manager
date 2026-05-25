import { describe, expect, it } from "vitest";

import {
  CUSTOMER_BOOKING_PIEGA_REQUIRED_MESSAGE,
  evaluateCustomerBookingPiegaRule,
  type CustomerAppServiceCatalogRow,
} from "@/lib/customer-app/customerBookingServiceRules";

function row(
  partial: Partial<CustomerAppServiceCatalogRow> & Pick<CustomerAppServiceCatalogRow, "name">,
): CustomerAppServiceCatalogRow {
  return {
    id: partial.id ?? 1,
    category_name: partial.category_name ?? null,
    need_processing: partial.need_processing ?? false,
    ...partial,
  };
}

describe("evaluateCustomerBookingPiegaRule", () => {
  it("colore senza piega → blocca", () => {
    const r = evaluateCustomerBookingPiegaRule([
      row({ id: 1, name: "Tinta completa", category_name: "Colorazione" }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe(CUSTOMER_BOOKING_PIEGA_REQUIRED_MESSAGE);
    }
  });

  it("colore con piega → ok", () => {
    const r = evaluateCustomerBookingPiegaRule([
      row({ id: 1, name: "Tinta completa", category_name: "Colorazione" }),
      row({ id: 2, name: "Piega phon", category_name: "Styling" }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("taglio donna senza piega → blocca", () => {
    const r = evaluateCustomerBookingPiegaRule([
      row({ id: 3, name: "Taglio donna", category_name: "Taglio" }),
    ]);
    expect(r.ok).toBe(false);
  });

  it("taglio uomo senza piega → ok", () => {
    const r = evaluateCustomerBookingPiegaRule([
      row({ id: 4, name: "Taglio uomo", category_name: "Taglio" }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("piega sola → ok", () => {
    const r = evaluateCustomerBookingPiegaRule([
      row({ id: 5, name: "Piega", category_name: "Finish" }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("servizio tecnico (need_processing) senza piega → blocca", () => {
    const r = evaluateCustomerBookingPiegaRule([
      row({
        id: 6,
        name: "Posa colore",
        category_name: "Tecnico",
        need_processing: true,
      }),
    ]);
    expect(r.ok).toBe(false);
  });

  it("styling senza piega → blocca", () => {
    const r = evaluateCustomerBookingPiegaRule([
      row({ id: 7, name: "Mossature", category_name: "Styling" }),
    ]);
    expect(r.ok).toBe(false);
  });
});
