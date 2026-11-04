import { describe, expect, it } from "vitest";

import type { AgendaAppointment } from "@/lib/agenda/agendaContract";
import { getAgendaDisplayServiceLines } from "@/lib/agenda/agendaGridDisplay";
import {
  computeAgendaBoxHeightPx,
  computeAgendaBoxLayout,
  computeAgendaBoxTopPx,
  resolveAgendaLineDurationMinutes,
  resolveAgendaLineVisualSegments,
} from "@/lib/agenda/agendaBoxLayout";
import {
  SLOT_MINUTES,
  agendaGridDayStartLabel,
  generateHours,
} from "@/components/agenda/utils";

function multiServiceAppointment(): AgendaAppointment {
  return {
    id: 129,
    start_time: "2026-05-29T15:15:00",
    end_time: "2026-05-29T16:35:00",
    status: "scheduled",
    sale_id: null,
    notes: null,
    staff_id: 56,
    customer_id: "c1",
    customers: { first_name: "Mario", last_name: "Rossi" },
    appointment_services: [
      {
        id: 1,
        appointment_id: 129,
        service_id: 1,
        start_time: "2026-05-29 15:15:00",
        duration_minutes: 35,
        duration_active: null,
        duration_processing: null,
        need_processing: null,
        staff_id: 56,
        services: { id: 1, name: "Colore", duration: 35, color_code: "#a8754f" },
      },
      {
        id: 2,
        appointment_id: 129,
        service_id: 2,
        start_time: "2026-05-29 15:50:00",
        duration_minutes: 45,
        duration_active: null,
        duration_processing: null,
        need_processing: null,
        staff_id: 56,
        services: { id: 2, name: "Piega", duration: 45, color_code: "#a8754f" },
      },
    ],
  };
}

describe("resolveAgendaLineDurationMinutes", () => {
  it("multi-servizio: ogni riga usa la propria durata (non la somma)", () => {
    const app = multiServiceAppointment();
    const [colore, piega] = getAgendaDisplayServiceLines(app);

    expect(colore.duration_minutes).toBe(35);
    expect(piega.duration_minutes).toBe(45);
    expect(resolveAgendaLineDurationMinutes(colore, app)).toBe(35);
    expect(resolveAgendaLineDurationMinutes(piega, app)).toBe(45);
  });

  it("servizio singolo usa duration_minutes riga", () => {
    const line = {
      duration_minutes: 30,
      services: { duration: 60 },
    };
    expect(
      resolveAgendaLineDurationMinutes(line as never, {
        appointment_services: [line],
      } as never),
    ).toBe(30);
  });
});

describe("computeAgendaBoxLayout", () => {
  const slotPx = 26;
  const hours = generateHours(agendaGridDayStartLabel(1), "20:30", SLOT_MINUTES);

  it("ogni servizio ha altezza dalla propria durata", () => {
    const app = multiServiceAppointment();
    const [colore, piega] = getAgendaDisplayServiceLines(app);
    const layoutColore = computeAgendaBoxLayout({
      line: colore,
      appointment: app,
      hours,
      slotPx,
    });
    const layoutPiega = computeAgendaBoxLayout({
      line: piega,
      appointment: app,
      hours,
      slotPx,
    });

    expect(layoutColore.durationMin).toBe(35);
    expect(layoutColore.heightPx).toBe((35 / SLOT_MINUTES) * slotPx);
    expect(layoutPiega.durationMin).toBe(45);
    expect(layoutPiega.heightPx).toBe((45 / SLOT_MINUTES) * slotPx);
  });

  it("start 15:15 → top allineato a 15:15 (non 15:00)", () => {
    const app = multiServiceAppointment();
    const line = getAgendaDisplayServiceLines(app)[0];
    const top = computeAgendaBoxTopPx(line.start_time, hours, slotPx);
    const top1500 = computeAgendaBoxTopPx("2026-05-29T15:00:00", hours, slotPx);

    expect(top).toBeGreaterThan(top1500);
    expect(top - top1500).toBe(slotPx);
  });
});

describe("computeAgendaBoxHeightPx", () => {
  it("rispetta minimo card ma non limita sotto 80 min", () => {
    const h80 = computeAgendaBoxHeightPx(80, 26);
    expect(h80).toBeGreaterThan(130);
  });
});

describe("resolveAgendaLineVisualSegments", () => {
  it("D=95 A=35 P=30 → busy 35, free 30, busy 30 (frazioni)", () => {
    const segs = resolveAgendaLineVisualSegments({
      duration_minutes: 95,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
    expect(segs).toEqual([
      {
        kind: "busy",
        startOffsetMinutes: 0,
        endOffsetMinutes: 35,
        topFraction: 0,
        heightFraction: 35 / 95,
      },
      {
        kind: "free",
        startOffsetMinutes: 35,
        endOffsetMinutes: 65,
        topFraction: 35 / 95,
        heightFraction: 30 / 95,
      },
      {
        kind: "busy",
        startOffsetMinutes: 65,
        endOffsetMinutes: 95,
        topFraction: 65 / 95,
        heightFraction: 30 / 95,
      },
    ]);
  });

  it("senza snapshot → un solo segmento busy pieno", () => {
    expect(
      resolveAgendaLineVisualSegments({
        duration_minutes: 45,
        duration_active: null,
        duration_processing: null,
        need_processing: null,
      }),
    ).toEqual([
      {
        kind: "busy",
        startOffsetMinutes: 0,
        endOffsetMinutes: 45,
        topFraction: 0,
        heightFraction: 1,
      },
    ]);
  });
});
