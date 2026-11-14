import { describe, expect, it } from "vitest";

import { resolveServiceDurationSnapshotForBooking } from "@/lib/agenda/agendaContract";
import {
  buildCustomerBookingLines,
  totalDurationMinutesFromLines,
} from "@/lib/customer-app/buildCustomerBookingLines";
import {
  composeCustomerBookingServiceIds,
  normalizeCustomerAppBookingServiceIds,
  type CustomerAppServiceCatalogRow,
} from "@/lib/customer-app/customerBookingServiceRules";
import { hashCustomerBookingPayload } from "@/lib/customer-app/customerBookingIdempotency";

/**
 * Pipeline integrata (senza DB): catalogo → compose → durate/prezzi riepilogo →
 * stesse linee che andrebbero in availability/POST, senza doppioni; retry stesso hash.
 */
describe("customer booking composition pipeline", () => {
  const catalog: CustomerAppServiceCatalogRow[] = [
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
  ];

  const prices = new Map<number, number>([
    [62, 3],
    [58, 22],
    [66, 70],
  ]);

  const durationSnap = new Map([
    [
      62,
      resolveServiceDurationSnapshotForBooking({
        duration: 10,
        duration_active: 10,
        duration_processing: 0,
        need_processing: false,
      }),
    ],
    [
      58,
      resolveServiceDurationSnapshotForBooking({
        duration: 45,
        duration_active: 45,
        duration_processing: 0,
        need_processing: false,
      }),
    ],
    [
      66,
      resolveServiceDurationSnapshotForBooking({
        duration: 40,
        duration_active: 40,
        duration_processing: 40,
        need_processing: true,
      }),
    ],
  ]);

  it("stessi ID/ordine/durate/prezzo da catalogo a linee booking", () => {
    const fromPrimary = normalizeCustomerAppBookingServiceIds(catalog, [66]);
    const fromAlreadyComposed = normalizeCustomerAppBookingServiceIds(catalog, [
      62, 66, 58,
    ]);
    expect(fromPrimary).toEqual(fromAlreadyComposed);
    expect(fromPrimary).toEqual({
      ok: true,
      serviceIds: [62, 66, 58],
      companionIds: [62],
    });
    if (!fromPrimary.ok) return;

    const ids = fromPrimary.serviceIds;
    expect(composeCustomerBookingServiceIds(catalog, ids)).toEqual(ids);

    const totalPrice = ids.reduce((sum, id) => sum + (prices.get(id) ?? 0), 0);
    expect(totalPrice).toBe(95);

    const lines = buildCustomerBookingLines(
      "2026-11-20T13:30:00",
      ids.map((serviceId) => {
        const snap = durationSnap.get(serviceId)!;
        return {
          service_id: serviceId,
          staff_id: 56,
          duration_minutes: snap.duration_minutes,
          duration_active: snap.duration_active,
          duration_processing: snap.duration_processing,
          need_processing: snap.need_processing,
          price: prices.get(serviceId)!,
          vat_rate: 22,
        };
      }),
    );

    expect(lines.map((l) => l.service_id)).toEqual([62, 66, 58]);
    // Snapshot catalog: 10 / 80 / 45; buildCustomerBookingLines può clampare allo slot Agenda.
    expect(lines[0]?.duration_minutes).toBe(durationSnap.get(62)!.duration_minutes);
    expect(lines[1]?.duration_minutes).toBe(80);
    expect(lines[2]?.duration_minutes).toBe(45);
    expect(totalDurationMinutesFromLines(lines)).toBe(
      lines.reduce((sum, line) => sum + line.duration_minutes, 0),
    );
    expect(lines[0]?.start_time).toBe("2026-11-20T13:30:00");
    expect(lines[1]?.start_time).toBe(lines[0]?.end_time);
    expect(lines[2]?.start_time).toBe(lines[1]?.end_time);
  });

  it("server non aggiunge doppioni se il client ha già composto", () => {
    const once = normalizeCustomerAppBookingServiceIds(catalog, [62, 66, 58]);
    const twice = normalizeCustomerAppBookingServiceIds(
      catalog,
      once.ok ? once.serviceIds : [],
    );
    expect(once).toEqual({
      ok: true,
      serviceIds: [62, 66, 58],
      companionIds: [62],
    });
    expect(twice).toEqual(once);
  });

  it("retry con stesso payload → stesso hash idempotency", () => {
    const body = {
      salonId: 1,
      serviceIds: [62, 66, 58],
      staffId: 56,
      startTime: "2026-11-20T13:30:00",
      notes: null as string | null,
    };
    const h1 = hashCustomerBookingPayload(body);
    const h2 = hashCustomerBookingPayload({ ...body });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(
      hashCustomerBookingPayload({ ...body, serviceIds: [66, 58] }),
    );
  });

  it("shampoo autonomo rifiutato", () => {
    expect(normalizeCustomerAppBookingServiceIds(catalog, [62]).ok).toBe(false);
  });
});
