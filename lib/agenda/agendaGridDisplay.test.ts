import { describe, expect, it } from "vitest";

import type { AgendaAppointment } from "@/lib/agenda/agendaContract";
import {
  getAgendaDisplayServiceLines,
  isAgendaAppointmentActionsLine,
} from "@/lib/agenda/agendaGridDisplay";

function appWithLines(
  lines: Array<{
    id: number;
    service_id?: number;
    start_time: string;
    duration_minutes: number;
    name: string;
    staff_id?: number;
    price?: number;
    is_customer_composition_companion?: boolean;
  }>,
  opts?: { source?: string | null; id?: number },
): AgendaAppointment {
  return {
    id: opts?.id ?? 129,
    start_time: lines[0]?.start_time ?? "",
    end_time: "2026-05-29T16:35:00",
    status: "scheduled",
    sale_id: null,
    notes: null,
    source: opts?.source ?? null,
    staff_id: lines[0]?.staff_id ?? 56,
    customer_id: "c1",
    customers: { first_name: "Mario", last_name: "Rossi" },
    appointment_services: lines.map((ln) => ({
      id: ln.id,
      appointment_id: opts?.id ?? 129,
      service_id: ln.service_id ?? ln.id,
      start_time: ln.start_time,
      duration_minutes: ln.duration_minutes,
      duration_active: null,
      duration_processing: null,
      need_processing: null,
      staff_id: ln.staff_id ?? 56,
      is_customer_composition_companion:
        ln.is_customer_composition_companion === true,
      services: {
        id: ln.service_id ?? ln.id,
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

  it("azioni sulla prima riga display (salta companion nascosto)", () => {
    const app = appWithLines(
      [
        {
          id: 901,
          service_id: 62,
          start_time: "2026-11-20T13:30:00",
          duration_minutes: 15,
          name: "Shampoo",
          is_customer_composition_companion: true,
        },
        {
          id: 902,
          service_id: 66,
          start_time: "2026-11-20T13:45:00",
          duration_minutes: 80,
          name: "Erbe Botaniche",
        },
        {
          id: 903,
          service_id: 58,
          start_time: "2026-11-20T15:05:00",
          duration_minutes: 45,
          name: "Piega",
        },
      ],
      { source: "customer_app" },
    );
    expect(isAgendaAppointmentActionsLine(app, 901)).toBe(false);
    expect(isAgendaAppointmentActionsLine(app, 902)).toBe(true);
    expect(isAgendaAppointmentActionsLine(app, 903)).toBe(false);
  });
});

describe("composition companion vs checkout", () => {
  it("Erbe + Shampoo companion + Piega: Agenda 2 righe, checkout/totale 3", () => {
    const app = appWithLines(
      [
        {
          id: 901,
          service_id: 62,
          start_time: "2026-11-20T13:30:00",
          duration_minutes: 15,
          name: "Shampoo",
          price: 3,
          is_customer_composition_companion: true,
        },
        {
          id: 902,
          service_id: 66,
          start_time: "2026-11-20T13:45:00",
          duration_minutes: 80,
          name: "Erbe Botaniche",
          price: 70,
        },
        {
          id: 903,
          service_id: 58,
          start_time: "2026-11-20T15:05:00",
          duration_minutes: 45,
          name: "Piega",
          price: 22,
        },
      ],
      { source: "customer_app" },
    );

    const display = getAgendaDisplayServiceLines(app);
    expect(display.map((l) => l.services.name)).toEqual([
      "Erbe Botaniche",
      "Piega",
    ]);
    expect(display.map((l) => l.service_id)).toEqual([66, 58]);

    // Dati prenotazione / Cassa: tutte le righe restano (anche companion).
    expect(app.appointment_services).toHaveLength(3);
    expect(app.appointment_services.map((l) => l.service_id)).toEqual([
      62, 66, 58,
    ]);
    const checkoutTotal = app.appointment_services.reduce(
      (sum, ln, i) =>
        sum +
        ([3, 70, 22][i] ?? 0),
      0,
    );
    expect(checkoutTotal).toBe(95);
    const occupancyMinutes = app.appointment_services.reduce(
      (sum, ln) => sum + ln.duration_minutes,
      0,
    );
    expect(occupancyMinutes).toBe(140);
  });

  it("Shampoo service_id 62 senza flag companion resta visibile in Agenda", () => {
    const app = appWithLines([
      {
        id: 1,
        service_id: 62,
        start_time: "2026-11-20T10:00:00",
        duration_minutes: 15,
        name: "Shampoo",
        is_customer_composition_companion: false,
      },
      {
        id: 2,
        service_id: 58,
        start_time: "2026-11-20T10:15:00",
        duration_minutes: 45,
        name: "Piega",
      },
    ]);

    expect(getAgendaDisplayServiceLines(app).map((l) => l.services.name)).toEqual([
      "Shampoo",
      "Piega",
    ]);
  });
});
