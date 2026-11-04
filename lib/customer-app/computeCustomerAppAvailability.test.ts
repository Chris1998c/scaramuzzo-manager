import { describe, expect, it } from "vitest";
import {
  buildProposedBookingBusyIntervals,
  parseLocal,
} from "@/lib/agenda/agendaContract";

describe("buildProposedBookingBusyIntervals (Customer App)", () => {
  it("colore con posa da catalogo: busy solo sulla fase attiva", () => {
    const start = "2026-05-29T15:00:00";
    const t0 = parseLocal(start).getTime();
    const busy = buildProposedBookingBusyIntervals({
      startTime: start,
      lines: [
        {
          duration_minutes: 65,
          duration_active: 35,
          duration_processing: 30,
          need_processing: true,
        },
      ],
    });
    expect(busy).toEqual([{ startMs: t0, endMs: t0 + 35 * 60_000 }]);
  });

  it("colore + piega sequenziali: busy colore attivo + busy piega intera", () => {
    const start = "2026-05-29T15:00:00";
    const t0 = parseLocal(start).getTime();
    const busy = buildProposedBookingBusyIntervals({
      startTime: start,
      lines: [
        {
          duration_minutes: 65,
          duration_active: 35,
          duration_processing: 30,
          need_processing: true,
        },
        {
          duration_minutes: 45,
          duration_active: 0,
          duration_processing: 0,
          need_processing: false,
        },
      ],
    });
    expect(busy).toEqual([
      { startMs: t0, endMs: t0 + 35 * 60_000 },
      { startMs: t0 + 65 * 60_000, endMs: t0 + 110 * 60_000 },
    ]);
  });

  it("senza posa: busy = tutta la durata proposta", () => {
    const start = "2026-05-29T10:00:00";
    const t0 = parseLocal(start).getTime();
    expect(
      buildProposedBookingBusyIntervals({
        startTime: start,
        lines: [
          {
            duration_minutes: 30,
            duration_active: 30,
            duration_processing: 0,
            need_processing: false,
          },
        ],
      }),
    ).toEqual([{ startMs: t0, endMs: t0 + 30 * 60_000 }]);
  });
});
