import { describe, expect, it } from "vitest";

import type { AgendaAppointment } from "@/lib/agenda/agendaContract";
import { getAgendaDisplayServiceLines } from "@/lib/agenda/agendaGridDisplay";
import {
  computeAgendaBoxHeightPx,
  computeAgendaBoxLayout,
  computeAgendaBoxTopPx,
  resolveAgendaLineDurationMinutes,
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
        staff_id: 56,
        services: { id: 1, name: "Colore", duration: 35, color_code: "#a8754f" },
      },
      {
        id: 2,
        appointment_id: 129,
        service_id: 2,
        start_time: "2026-05-29 15:50:00",
        duration_minutes: 45,
        staff_id: 56,
        services: { id: 2, name: "Piega", duration: 45, color_code: "#a8754f" },
      },
    ],
  };
}

describe("resolveAgendaLineDurationMinutes", () => {
  it("multi-servizio 35+45 → 80 anche se services.duration della riga display è 35", () => {
    const app = multiServiceAppointment();
    const display = getAgendaDisplayServiceLines(app)[0];

    expect(display.duration_minutes).toBe(80);
    expect(resolveAgendaLineDurationMinutes(display, app)).toBe(80);
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

  it("displayLine 80 min → height 80/15*slotPx", () => {
    const app = multiServiceAppointment();
    const line = getAgendaDisplayServiceLines(app)[0];
    const layout = computeAgendaBoxLayout({ line, appointment: app, hours, slotPx });

    expect(layout.durationMin).toBe(80);
    expect(layout.heightPx).toBe((80 / SLOT_MINUTES) * slotPx);
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
