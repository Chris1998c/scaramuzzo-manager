import { describe, expect, it } from "vitest";

import type { AgendaAppointment } from "@/lib/agenda/agendaContract";
import {
  getAgendaDisplayServiceLines,
  isAgendaAppointmentActionsLine,
} from "@/lib/agenda/agendaGridDisplay";

function appWithLines(
  lines: Array<{
    id: number;
    start_time: string;
    duration_minutes: number;
    name: string;
    staff_id?: number;
  }>,
): AgendaAppointment {
  return {
    id: 129,
    start_time: lines[0]?.start_time ?? "",
    end_time: "2026-05-29T16:35:00",
    status: "scheduled",
    sale_id: null,
    notes: null,
    staff_id: lines[0]?.staff_id ?? 56,
    customer_id: "c1",
    customers: { first_name: "Mario", last_name: "Rossi" },
    appointment_services: lines.map((ln) => ({
      id: ln.id,
      appointment_id: 129,
      service_id: ln.id,
      start_time: ln.start_time,
      duration_minutes: ln.duration_minutes,
      duration_active: null,
      duration_processing: null,
      need_processing: null,
      staff_id: ln.staff_id ?? 56,
      services: {
        id: ln.id,
        name: ln.name,
        duration: ln.duration_minutes,
        color_code: "#a8754f",
      },
    })),
  };
}

describe("getAgendaDisplayServiceLines", () => {
  it("due servizi stesso collaboratore: due blocchi con orari e durate proprie", () => {
    const display = getAgendaDisplayServiceLines(
      appWithLines([
        { id: 1, start_time: "2026-05-29 15:15:00", duration_minutes: 35, name: "Colore" },
        { id: 2, start_time: "2026-05-29 15:50:00", duration_minutes: 45, name: "Piega" },
      ]),
    );

    expect(display).toHaveLength(2);
    expect(display[0].services.name).toBe("Colore");
    expect(display[0].start_time).toBe("2026-05-29 15:15:00");
    expect(display[0].duration_minutes).toBe(35);
    expect(display[0].staff_id).toBe(56);
    expect(display[1].services.name).toBe("Piega");
    expect(display[1].start_time).toBe("2026-05-29 15:50:00");
    expect(display[1].duration_minutes).toBe(45);
    expect(display[1].staff_id).toBe(56);
  });

  it("due servizi collaboratori diversi: staff_id distinti sulle righe display", () => {
    const display = getAgendaDisplayServiceLines(
      appWithLines([
        {
          id: 10,
          start_time: "2026-05-29T10:00:00",
          duration_minutes: 50,
          name: "Taglio",
          staff_id: 56,
        },
        {
          id: 11,
          start_time: "2026-05-29T10:50:00",
          duration_minutes: 45,
          name: "Piega",
          staff_id: 63,
        },
      ]),
    );

    expect(display).toHaveLength(2);
    expect(display[0].services.name).toBe("Taglio");
    expect(display[0].staff_id).toBe(56);
    expect(display[0].duration_minutes).toBe(50);
    expect(display[1].services.name).toBe("Piega");
    expect(display[1].staff_id).toBe(63);
    expect(display[1].duration_minutes).toBe(45);
  });

  it("servizio singolo invariato", () => {
    const display = getAgendaDisplayServiceLines(
      appWithLines([
        { id: 5, start_time: "2026-05-29T10:00:00", duration_minutes: 30, name: "Taglio" },
      ]),
    );

    expect(display).toHaveLength(1);
    expect(display[0].duration_minutes).toBe(30);
  });

  it("ordina per start_time poi id", () => {
    const display = getAgendaDisplayServiceLines(
      appWithLines([
        { id: 2, start_time: "2026-05-29 11:00:00", duration_minutes: 20, name: "B" },
        { id: 1, start_time: "2026-05-29 10:00:00", duration_minutes: 30, name: "A" },
      ]),
    );
    expect(display.map((l) => l.services.name)).toEqual(["A", "B"]);
  });
});

describe("isAgendaAppointmentActionsLine", () => {
  it("solo la riga con start minimo mostra le azioni appuntamento", () => {
    const app = appWithLines([
      { id: 1, start_time: "2026-05-29 15:15:00", duration_minutes: 35, name: "Colore" },
      { id: 2, start_time: "2026-05-29 15:50:00", duration_minutes: 45, name: "Piega" },
    ]);
    expect(isAgendaAppointmentActionsLine(app, 1)).toBe(true);
    expect(isAgendaAppointmentActionsLine(app, 2)).toBe(false);
  });
});
