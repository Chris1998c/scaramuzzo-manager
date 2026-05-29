import { describe, expect, it } from "vitest";

import type { AgendaAppointment } from "@/lib/agenda/agendaContract";
import { getAgendaDisplayServiceLines } from "@/lib/agenda/agendaGridDisplay";

function appWithLines(
  lines: Array<{
    id: number;
    start_time: string;
    duration_minutes: number;
    name: string;
  }>,
): AgendaAppointment {
  return {
    id: 129,
    start_time: lines[0]?.start_time ?? "",
    end_time: "2026-05-29T16:35:00",
    status: "scheduled",
    sale_id: null,
    notes: null,
    staff_id: 56,
    customer_id: "c1",
    customers: { first_name: "Mario", last_name: "Rossi" },
    appointment_services: lines.map((ln) => ({
      id: ln.id,
      appointment_id: 129,
      service_id: ln.id,
      start_time: ln.start_time,
      duration_minutes: ln.duration_minutes,
      staff_id: 56,
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
  it("appointment 129-like: una sola riga display con durata totale 80", () => {
    const display = getAgendaDisplayServiceLines(
      appWithLines([
        { id: 1, start_time: "2026-05-29 15:15:00", duration_minutes: 35, name: "Colore" },
        { id: 2, start_time: "2026-05-29 15:50:00", duration_minutes: 45, name: "Piega" },
      ]),
    );

    expect(display).toHaveLength(1);
    expect(display[0].services.name).toBe("Colore");
    expect(display[0].start_time).toBe("2026-05-29 15:15:00");
    expect(display[0].duration_minutes).toBe(80);
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
});
