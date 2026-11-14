import { describe, expect, it } from "vitest";

import {
  CUSTOMER_BOOKING_PIEGA_REQUIRED_MESSAGE,
  composeCustomerBookingServiceIds,
  evaluateCustomerBookingPiegaRule,
  normalizeCustomerAppBookingServiceIds,
  serviceRequiresShampooCompanion,
  type CustomerAppServiceCatalogRow,
} from "@/lib/customer-app/customerBookingServiceRules";

function row(
  partial: Partial<CustomerAppServiceCatalogRow> & Pick<CustomerAppServiceCatalogRow, "name">,
): CustomerAppServiceCatalogRow {
  return {
    id: partial.id ?? 1,
    category_name: partial.category_name ?? null,
    need_processing: partial.need_processing ?? false,
    visible_in_customer_app: partial.visible_in_customer_app ?? true,
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

describe("composeCustomerBookingServiceIds", () => {
  const shampoo = row({
    id: 62,
    name: "Shampoo",
    category_name: "lavaggio",
    visible_in_customer_app: false,
  });
  const piega = row({ id: 58, name: "Piega", category_name: "styling" });
  const erbe = row({
    id: 66,
    name: "Erbe Botaniche",
    category_name: "erbe",
    need_processing: true,
  });
  const colore = row({
    id: 64,
    name: "Colore Ossidazione",
    category_name: "colore",
    need_processing: true,
  });
  const taglio = row({ id: 55, name: "Taglio Donna Scaramuzzo", category_name: "taglio" });
  const taglioUomo = row({ id: 54, name: "Taglio Uomo Scaramuzzo", category_name: "taglio" });
  const catalog = [shampoo, piega, erbe, colore, taglio, taglioUomo];

  it("erbe → shampoo + erbe + piega", () => {
    expect(composeCustomerBookingServiceIds(catalog, [66])).toEqual([62, 66, 58]);
  });

  it("colore → shampoo + colore + piega", () => {
    expect(composeCustomerBookingServiceIds(catalog, [64])).toEqual([62, 64, 58]);
  });

  it("taglio donna → shampoo + taglio + piega", () => {
    expect(composeCustomerBookingServiceIds(catalog, [55])).toEqual([62, 55, 58]);
  });

  it("taglio uomo → invariato (niente shampoo/piega auto)", () => {
    expect(composeCustomerBookingServiceIds(catalog, [54])).toEqual([54]);
  });

  it("shampoo già in input compose → non duplica", () => {
    expect(composeCustomerBookingServiceIds(catalog, [62, 66])).toEqual([62, 66, 58]);
  });

  it("piega già scelta → non duplica e ordina", () => {
    expect(composeCustomerBookingServiceIds(catalog, [66, 58, 62])).toEqual([
      62, 66, 58,
    ]);
  });

  it("serviceRequiresShampooCompanion: erbe/colore/taglio sì, piega no", () => {
    expect(serviceRequiresShampooCompanion(erbe)).toBe(true);
    expect(serviceRequiresShampooCompanion(colore)).toBe(true);
    expect(serviceRequiresShampooCompanion(taglio)).toBe(true);
    expect(serviceRequiresShampooCompanion(piega)).toBe(false);
    expect(serviceRequiresShampooCompanion(shampoo)).toBe(false);
  });
});

describe("normalizeCustomerAppBookingServiceIds", () => {
  const shampoo = row({
    id: 62,
    name: "Shampoo",
    category_name: "lavaggio",
    visible_in_customer_app: false,
  });
  const piega = row({ id: 58, name: "Piega", category_name: "styling" });
  const erbe = row({
    id: 66,
    name: "Erbe Botaniche",
    category_name: "erbe",
    need_processing: true,
  });
  const catalog = [shampoo, piega, erbe];

  it("erbe sola → stessi ID composti senza doppioni", () => {
    const a = normalizeCustomerAppBookingServiceIds(catalog, [66]);
    const b = normalizeCustomerAppBookingServiceIds(catalog, [62, 66, 58]);
    expect(a).toEqual({ ok: true, serviceIds: [62, 66, 58] });
    expect(b).toEqual({ ok: true, serviceIds: [62, 66, 58] });
  });

  it("shampoo da solo → rifiuto", () => {
    const r = normalizeCustomerAppBookingServiceIds(catalog, [62]);
    expect(r.ok).toBe(false);
  });

  it("pipeline disponibilità/riepilogo/POST condivide ordine e set", () => {
    const composed = normalizeCustomerAppBookingServiceIds(catalog, [66]);
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.serviceIds).toEqual([62, 66, 58]);
    expect(new Set(composed.serviceIds).size).toBe(3);
  });
});
