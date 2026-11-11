import { describe, expect, it } from "vitest";
import {
  absoluteIntervalsOverlapAny,
  appointmentServiceBusyAbsoluteIntervals,
  clampDurationMinutes,
  computeHeaderFromLines,
  commitLinePatch,
  normalizeAgendaRows,
  parseLocal,
  resolveAppointmentServiceOccupancyIntervals,
  resolveServiceDurationSnapshotForBooking,
  snapToAgendaSlot,
  toNoZ,
} from "@/lib/agenda/agendaContract";
import { SLOT_MINUTES } from "@/components/agenda/utils";

describe("appointmentServiceBusyAbsoluteIntervals", () => {
  const start = "2026-05-29T15:00:00";
  const t0 = parseLocal(start).getTime();

  it("D=95 A=35 P=30: busy 0–35 e 65–95", () => {
    const busy = appointmentServiceBusyAbsoluteIntervals({
      startTime: start,
      duration_minutes: 95,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
    expect(busy).toEqual([
      { startMs: t0, endMs: t0 + 35 * 60_000 },
      { startMs: t0 + 65 * 60_000, endMs: t0 + 95 * 60_000 },
    ]);
  });

  it("D=65 A=35 P=30: solo busy 0–35", () => {
    expect(
      appointmentServiceBusyAbsoluteIntervals({
        startTime: start,
        duration_minutes: 65,
        duration_active: 35,
        duration_processing: 30,
        need_processing: true,
      }),
    ).toEqual([{ startMs: t0, endMs: t0 + 35 * 60_000 }]);
  });

  it("senza snapshot → full duration", () => {
    expect(
      appointmentServiceBusyAbsoluteIntervals({
        startTime: start,
        duration_minutes: 95,
      }),
    ).toEqual([{ startMs: t0, endMs: t0 + 95 * 60_000 }]);
  });

  it("overlap durante posa consentito; attivo e coda rifiutati", () => {
    const colorBusy = appointmentServiceBusyAbsoluteIntervals({
      startTime: start,
      duration_minutes: 95,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
    const inPosa = [{ startMs: t0 + 40 * 60_000, endMs: t0 + 55 * 60_000 }];
    const inActive = [{ startMs: t0 + 10 * 60_000, endMs: t0 + 25 * 60_000 }];
    const inTail = [{ startMs: t0 + 70 * 60_000, endMs: t0 + 85 * 60_000 }];
    expect(absoluteIntervalsOverlapAny(colorBusy, inPosa)).toBe(false);
    expect(absoluteIntervalsOverlapAny(colorBusy, inActive)).toBe(true);
    expect(absoluteIntervalsOverlapAny(colorBusy, inTail)).toBe(true);
  });
});

describe("resolveServiceDurationSnapshotForBooking", () => {
  it("Colore Ossidazione: duration=35, active=35, processing=30 → duration_minutes=65 + snapshot", () => {
    expect(
      resolveServiceDurationSnapshotForBooking({
        duration: 35,
        duration_active: 35,
        duration_processing: 30,
        need_processing: true,
      }),
    ).toEqual({
      duration_minutes: 65,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
  });

  it("duration già maggiore di active+processing → resta quella maggiore", () => {
    expect(
      resolveServiceDurationSnapshotForBooking({
        duration: 95,
        duration_active: 35,
        duration_processing: 30,
        need_processing: true,
      }),
    ).toEqual({
      duration_minutes: 95,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
  });

  it("servizio senza posa → duration_minutes = duration, snapshot need_processing false", () => {
    expect(
      resolveServiceDurationSnapshotForBooking({
        duration: 45,
        duration_active: 45,
        duration_processing: 0,
        need_processing: false,
      }),
    ).toEqual({
      duration_minutes: 45,
      duration_active: 45,
      duration_processing: 0,
      need_processing: false,
    });
  });

  it("righe storiche senza snapshot: occupancy resta full-duration", () => {
    const r = resolveAppointmentServiceOccupancyIntervals({
      duration_minutes: 95,
      duration_active: null,
      duration_processing: null,
      need_processing: null,
    });
    expect(r.processingValid).toBe(false);
    expect(r.busy).toEqual([{ startOffsetMinutes: 0, endOffsetMinutes: 95 }]);
    expect(r.free).toEqual([]);
  });
});

describe("resolveAppointmentServiceOccupancyIntervals", () => {
  it("riga 135: posa valida → display 95, busy 0–35 e 65–95, libera 35–65", () => {
    const r = resolveAppointmentServiceOccupancyIntervals({
      duration_minutes: 95,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
    expect(r.processingValid).toBe(true);
    expect(r.display).toEqual({ startOffsetMinutes: 0, endOffsetMinutes: 95 });
    expect(r.busy).toEqual([
      { startOffsetMinutes: 0, endOffsetMinutes: 35 },
      { startOffsetMinutes: 65, endOffsetMinutes: 95 },
    ]);
    expect(r.free).toEqual([{ startOffsetMinutes: 35, endOffsetMinutes: 65 }]);
  });

  it("senza posa → busy sull'intero intervallo", () => {
    const r = resolveAppointmentServiceOccupancyIntervals({
      duration_minutes: 45,
      duration_active: 45,
      duration_processing: 0,
      need_processing: false,
    });
    expect(r.processingValid).toBe(false);
    expect(r.display).toEqual({ startOffsetMinutes: 0, endOffsetMinutes: 45 });
    expect(r.busy).toEqual([{ startOffsetMinutes: 0, endOffsetMinutes: 45 }]);
    expect(r.free).toEqual([]);
  });

  it("D < A+P → nessun intervallo libero, busy su tutto D", () => {
    const r = resolveAppointmentServiceOccupancyIntervals({
      duration_minutes: 50,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
    expect(r.processingValid).toBe(false);
    expect(r.busy).toEqual([{ startOffsetMinutes: 0, endOffsetMinutes: 50 }]);
    expect(r.free).toEqual([]);
  });

  it("durata zero/negativa o dati mancanti → busy sull'intero (vuoto se D non positivo), senza throw", () => {
    expect(() =>
      resolveAppointmentServiceOccupancyIntervals({ duration_minutes: 0 }),
    ).not.toThrow();
    expect(resolveAppointmentServiceOccupancyIntervals({ duration_minutes: 0 })).toEqual({
      display: { startOffsetMinutes: 0, endOffsetMinutes: 0 },
      busy: [],
      free: [],
      processingValid: false,
    });
    expect(resolveAppointmentServiceOccupancyIntervals({ duration_minutes: -10 })).toEqual({
      display: { startOffsetMinutes: 0, endOffsetMinutes: 0 },
      busy: [],
      free: [],
      processingValid: false,
    });
    expect(
      resolveAppointmentServiceOccupancyIntervals({
        duration_minutes: null,
        need_processing: true,
        duration_active: 35,
        duration_processing: 30,
      }),
    ).toEqual({
      display: { startOffsetMinutes: 0, endOffsetMinutes: 0 },
      busy: [],
      free: [],
      processingValid: false,
    });
    expect(
      resolveAppointmentServiceOccupancyIntervals({
        duration_minutes: 60,
        need_processing: true,
        duration_active: undefined,
        duration_processing: 30,
      }),
    ).toEqual({
      display: { startOffsetMinutes: 0, endOffsetMinutes: 60 },
      busy: [{ startOffsetMinutes: 0, endOffsetMinutes: 60 }],
      free: [],
      processingValid: false,
    });
  });

  it("A+P = D → posa valida senza coda busy", () => {
    const r = resolveAppointmentServiceOccupancyIntervals({
      duration_minutes: 65,
      duration_active: 35,
      duration_processing: 30,
      need_processing: true,
    });
    expect(r.processingValid).toBe(true);
    expect(r.busy).toEqual([{ startOffsetMinutes: 0, endOffsetMinutes: 35 }]);
    expect(r.free).toEqual([{ startOffsetMinutes: 35, endOffsetMinutes: 65 }]);
  });
});

describe("clampDurationMinutes", () => {
  it("usa SLOT_MINUTES per null, undefined, NaN, sotto minimo", () => {
    expect(clampDurationMinutes(null)).toBe(SLOT_MINUTES);
    expect(clampDurationMinutes(undefined)).toBe(SLOT_MINUTES);
    expect(clampDurationMinutes(NaN)).toBe(SLOT_MINUTES);
    expect(clampDurationMinutes(10)).toBe(SLOT_MINUTES);
    expect(clampDurationMinutes(-5)).toBe(SLOT_MINUTES);
  });
  it("arrotonda durate valide >= SLOT_MINUTES", () => {
    expect(clampDurationMinutes(30)).toBe(30);
    expect(clampDurationMinutes(45.2)).toBe(45);
  });
});

describe("normalizeAgendaRows", () => {
  const baseRow = {
    id: 100,
    start_time: "2026-04-03T10:00:00",
    end_time: "2026-04-03T10:30:00",
    status: "scheduled",
    notes: null,
    staff_id: 7,
    customer_id: 50,
    customer: { first_name: "Mario", last_name: "Rossi" },
    appointment_services: [
      {
        id: 1,
        appointment_id: 100,
        service_id: 99,
        start_time: "2026-04-03T10:00:00",
        duration_minutes: 30,
        staff_id: 7,
        services: {
          id: 99,
          name: "Taglio",
          duration: 30,
          color_code: "#ff0000",
        },
      },
    ],
  };

  it("customer nullo: nome cliente vuoto ma shape stabile", () => {
    const [a] = normalizeAgendaRows([{ ...baseRow, customer: null }] as unknown[]);
    expect(a.customers.first_name).toBe("");
    expect(a.customers.last_name).toBe("");
  });

  it("customer embed array: usa primo elemento", () => {
    const [a] = normalizeAgendaRows([
      {
        ...baseRow,
        customer: [
          { first_name: "Uno", last_name: "A" },
          { first_name: "Due", last_name: "B" },
        ],
      },
    ] as unknown[]);
    expect(a.customers).toEqual({ first_name: "Uno", last_name: "A" });
  });

  it("services nullo: fallback servizio sicuro", () => {
    const [a] = normalizeAgendaRows([
      {
        ...baseRow,
        appointment_services: [
          {
            id: 2,
            service_id: 1,
            start_time: "2026-04-03T10:00:00",
            duration_minutes: 30,
            staff_id: null,
            services: null,
          },
        ],
      },
    ] as unknown[]);
    expect(a.appointment_services[0].services.name).toBe("Servizio");
    expect(a.appointment_services[0].services.duration).toBe(30);
  });

  it("duration_minutes invalido: clamp a SLOT_MINUTES", () => {
    const [a] = normalizeAgendaRows([
      {
        ...baseRow,
        appointment_services: [
          {
            id: 3,
            service_id: 1,
            start_time: "2026-04-03T10:00:00",
            duration_minutes: null,
            staff_id: null,
            services: { id: 1, name: "X", duration: 30, color_code: "#fff" },
          },
        ],
      },
    ] as unknown[]);
    expect(a.appointment_services[0].duration_minutes).toBe(SLOT_MINUTES);
  });

  it("esclude righe senza id numerico valido (> 0)", () => {
    const [a] = normalizeAgendaRows([
      {
        ...baseRow,
        appointment_services: [
          { id: null, service_id: 1, start_time: "2026-04-03T10:00:00", duration_minutes: 30 },
          { id: 0, service_id: 1, start_time: "2026-04-03T10:00:00", duration_minutes: 30 },
          {
            id: 5,
            service_id: 1,
            start_time: "2026-04-03T10:00:00",
            duration_minutes: 30,
            services: {},
          },
        ],
      },
    ] as unknown[]);
    expect(a.appointment_services.length).toBe(1);
    expect(a.appointment_services[0].id).toBe(5);
  });

  it("esclude appuntamenti con id header non valido", () => {
    const out = normalizeAgendaRows([
      { ...baseRow, id: null },
      { ...baseRow, id: 0 },
      { ...baseRow, id: NaN },
    ] as unknown[]);
    expect(out.length).toBe(0);
  });

  it("status e notes assenti: default coerente", () => {
    const row = { ...baseRow };
    delete (row as Record<string, unknown>).status;
    delete (row as Record<string, unknown>).notes;
    const [a] = normalizeAgendaRows([row] as unknown[]);
    expect(a.status).toBe("scheduled");
    expect(a.notes).toBeNull();
  });
});

describe("computeHeaderFromLines", () => {
  it("una riga: start/end/staff coerenti", () => {
    const h = computeHeaderFromLines([
      {
        id: 1,
        start_time: "2026-04-03T10:00:00",
        duration_minutes: 30,
        staff_id: 5,
      },
    ]);
    expect(h.start_time).toBe("2026-04-03T10:00:00");
    expect(h.end_time).toBe("2026-04-03T10:30:00");
    expect(h.staff_id).toBe(5);
  });

  it("più righe già ordinate: stesso risultato di MIN/MAX", () => {
    const h = computeHeaderFromLines([
      {
        id: 1,
        start_time: "2026-04-03T10:00:00",
        duration_minutes: 45,
        staff_id: 3,
      },
      {
        id: 2,
        start_time: "2026-04-03T10:45:00",
        duration_minutes: 30,
        staff_id: 4,
      },
    ]);
    expect(h.start_time).toBe("2026-04-03T10:00:00");
    expect(h.end_time).toBe("2026-04-03T11:15:00");
    expect(h.staff_id).toBe(3);
  });

  it("più righe disordinate: MIN start, MAX end, staff prima riga temporale", () => {
    const h = computeHeaderFromLines([
      {
        id: 2,
        start_time: "2026-04-03T11:00:00",
        duration_minutes: 30,
        staff_id: 9,
      },
      {
        id: 1,
        start_time: "2026-04-03T10:00:00",
        duration_minutes: 60,
        staff_id: 5,
      },
    ]);
    expect(h.start_time).toBe("2026-04-03T10:00:00");
    expect(h.end_time).toBe("2026-04-03T11:30:00");
    expect(h.staff_id).toBe(5);
  });

  it("stesso orario start: tie-break su id crescente per staff header", () => {
    const h = computeHeaderFromLines([
      { id: 10, start_time: "2026-04-03T10:00:00", duration_minutes: 30, staff_id: 1 },
      { id: 5, start_time: "2026-04-03T10:00:00", duration_minutes: 30, staff_id: 2 },
    ]);
    expect(h.staff_id).toBe(2);
  });

  it("staff null sulla prima riga", () => {
    const h = computeHeaderFromLines([
      { id: 1, start_time: "2026-04-03T10:00:00", duration_minutes: 30, staff_id: null },
    ]);
    expect(h.staff_id).toBeNull();
  });

  it("durata sotto minimo: clamp interno evita end prima dello start", () => {
    const h = computeHeaderFromLines([
      { id: 1, start_time: "2026-04-03T10:00:00", duration_minutes: 5, staff_id: 1 },
    ]);
    expect(h.end_time >= h.start_time).toBe(true);
  });

  it("righe vuote: throw", () => {
    expect(() => computeHeaderFromLines([])).toThrow(/no lines/);
  });

  it("20+20 contigue non-15: header end = fine reale 10:40 (niente snap indietro)", () => {
    const h = computeHeaderFromLines([
      {
        id: 1,
        start_time: "2026-06-15T10:00:00",
        duration_minutes: 20,
        staff_id: 1,
      },
      {
        id: 2,
        start_time: "2026-06-15T10:20:00",
        duration_minutes: 20,
        staff_id: 1,
      },
    ]);
    expect(h.start_time).toBe("2026-06-15T10:00:00");
    expect(h.end_time).toBe("2026-06-15T10:40:00");
  });
});

describe("commitLinePatch guard", () => {
  it("rifiuta lineId non valido senza chiamare Supabase", async () => {
    const r = await commitLinePatch({} as Parameters<typeof commitLinePatch>[0], {
      appointmentId: 1,
      lineId: 0,
      patch: { duration_minutes: 30 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/lineId/);
  });

  it("rifiuta appointmentId non valido", async () => {
    const r = await commitLinePatch({} as Parameters<typeof commitLinePatch>[0], {
      appointmentId: 0,
      lineId: 1,
      patch: { duration_minutes: 30 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/appointmentId/);
  });

  it("patch vuota: no-op ok senza toccare Supabase", async () => {
    const r = await commitLinePatch({} as Parameters<typeof commitLinePatch>[0], {
      appointmentId: 12,
      lineId: 3,
      patch: {},
    });
    expect(r.ok).toBe(true);
  });
});

describe("snapToAgendaSlot", () => {
  it("12:20 -> 12:15", () => {
    const out = snapToAgendaSlot(parseLocal("2026-04-03T12:20:44"));
    expect(toNoZ(out)).toBe("2026-04-03T12:15:00");
  });

  it("12:23 -> 12:30", () => {
    const out = snapToAgendaSlot(parseLocal("2026-04-03T12:23:11"));
    expect(toNoZ(out)).toBe("2026-04-03T12:30:00");
  });

  it("azzera secondi e millisecondi", () => {
    const out = snapToAgendaSlot(parseLocal("2026-04-03T12:23:59"));
    expect(out.getSeconds()).toBe(0);
    expect(out.getMilliseconds()).toBe(0);
  });

  it("slot gia valido 12:15 resta 12:15", () => {
    const out = snapToAgendaSlot(parseLocal("2026-04-03T12:15:00"));
    expect(toNoZ(out)).toBe("2026-04-03T12:15:00");
  });
});
