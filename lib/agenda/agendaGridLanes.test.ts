import { describe, expect, it } from "vitest";

import type { AgendaAppointment, AgendaServiceLine } from "@/lib/agenda/agendaContract";
import { getAgendaDisplayServiceLines } from "@/lib/agenda/agendaGridDisplay";
import {
  agendaIntervalsOverlap,
  buildAgendaLanes,
  type AgendaLanePair,
} from "@/lib/agenda/agendaGridLanes";

const SLOT_PX = 26;

function pair(
  app: AgendaAppointment,
  line?: AgendaServiceLine,
): AgendaLanePair {
  const display = line ?? getAgendaDisplayServiceLines(app)[0]!;
  return { app, line: display };
}

function multiServiceApp(
  id: number,
  start: string,
  lines: Array<{
    start_time: string;
    duration_minutes: number;
    staff_id?: number;
    duration_active?: number | null;
    duration_processing?: number | null;
    need_processing?: boolean | null;
  }>,
): AgendaAppointment {
  return {
    id,
    start_time: start,
    end_time: "2026-05-29T18:00:00",
    status: "scheduled",
    sale_id: null,
    notes: null,
    staff_id: lines[0]?.staff_id ?? 56,
    customer_id: "c1",
    customers: { first_name: "A", last_name: "B" },
    appointment_services: lines.map((ln, i) => ({
      id: id * 10 + i,
      appointment_id: id,
      service_id: i + 1,
      start_time: ln.start_time,
      duration_minutes: ln.duration_minutes,
      duration_active: ln.duration_active ?? null,
      duration_processing: ln.duration_processing ?? null,
      need_processing: ln.need_processing ?? null,
      staff_id: ln.staff_id ?? 56,
      services: {
        id: i + 1,
        name: `S${i}`,
        duration: ln.duration_minutes,
        color_code: "#a8754f",
      },
    })),
  };
}

function singleServiceApp(
  id: number,
  start_time: string,
  duration_minutes: number,
  staff_id = 56,
): AgendaAppointment {
  return multiServiceApp(id, start_time, [{ start_time, duration_minutes, staff_id }]);
}

describe("agendaIntervalsOverlap", () => {
  it("15:15–16:35 vs 15:30–16:30 → overlap", () => {
    const a = { start: 15 * 60 + 15, end: 16 * 60 + 35 };
    const b = { start: 15 * 60 + 30, end: 16 * 60 + 30 };
    expect(agendaIntervalsOverlap(a, b)).toBe(true);
  });

  it("15:15–16:35 vs 17:00–18:00 → no overlap", () => {
    const a = { start: 15 * 60 + 15, end: 16 * 60 + 35 };
    const b = { start: 17 * 60, end: 18 * 60 };
    expect(agendaIntervalsOverlap(a, b)).toBe(false);
  });
});

describe("buildAgendaLanes", () => {
  it("due display lines stesso staff sovrapposte → laneCount 2, laneIndex diversi", () => {
    const appA = multiServiceApp(129, "2026-05-29T15:15:00", [
      { start_time: "2026-05-29 15:15:00", duration_minutes: 35 },
      { start_time: "2026-05-29 15:50:00", duration_minutes: 45 },
    ]);
    const appB = singleServiceApp(130, "2026-05-29T15:30:00", 60);
    const [colore] = getAgendaDisplayServiceLines(appA);

    const laid = buildAgendaLanes([pair(appA, colore), pair(appB)], SLOT_PX);

    expect(laid).toHaveLength(2);
    expect(laid[0]!.laneCount).toBe(2);
    expect(laid[1]!.laneCount).toBe(2);
    expect(laid[0]!.laneIndex).not.toBe(laid[1]!.laneIndex);
  });

  it("due display lines stesso staff non sovrapposte → laneCount 1", () => {
    const appA = singleServiceApp(1, "2026-05-29T15:15:00", 80);
    const appB = singleServiceApp(2, "2026-05-29T17:00:00", 60);

    const laid = buildAgendaLanes([pair(appA), pair(appB)], SLOT_PX);

    expect(laid[0]!.laneCount).toBe(1);
    expect(laid[1]!.laneCount).toBe(1);
    expect(laid[0]!.laneIndex).toBe(0);
    expect(laid[1]!.laneIndex).toBe(0);
  });

  it("due servizi stesso staff: collisioni usano durata riga (Piega 45, non somma 80)", () => {
    const appA = multiServiceApp(129, "2026-05-29T15:15:00", [
      { start_time: "2026-05-29 15:15:00", duration_minutes: 35 },
      { start_time: "2026-05-29 15:50:00", duration_minutes: 45 },
    ]);
    const [colore, piega] = getAgendaDisplayServiceLines(appA);
    expect(colore.duration_minutes).toBe(35);
    expect(piega.duration_minutes).toBe(45);

    const appB = singleServiceApp(130, "2026-05-29T16:00:00", 30);

    // Colore 15:15–15:50 non overlap con 16:00; Piega 15:50–16:35 sì
    const laidNoOverlap = buildAgendaLanes([pair(appA, colore), pair(appB)], SLOT_PX);
    expect(laidNoOverlap[0]!.laneCount).toBe(1);
    expect(laidNoOverlap[1]!.laneCount).toBe(1);

    const laidOverlap = buildAgendaLanes([pair(appA, piega), pair(appB)], SLOT_PX);
    expect(laidOverlap[0]!.laneCount).toBe(2);
    expect(laidOverlap[1]!.laneCount).toBe(2);
  });

  it("due servizi stesso collaboratore contigui: entrambi in lane senza overlap tra loro", () => {
    const app = multiServiceApp(50, "2026-05-29T10:00:00", [
      { start_time: "2026-05-29T10:00:00", duration_minutes: 50, staff_id: 56 },
      { start_time: "2026-05-29T10:50:00", duration_minutes: 45, staff_id: 56 },
    ]);
    const lines = getAgendaDisplayServiceLines(app);
    const laid = buildAgendaLanes(
      lines.map((line) => pair(app, line)),
      SLOT_PX,
    );
    expect(laid).toHaveLength(2);
    expect(laid[0]!.laneCount).toBe(1);
    expect(laid[1]!.laneCount).toBe(1);
  });

  it("posa valida: altro appuntamento solo nella fascia libera → stessa lane (pieno width)", () => {
    const color = multiServiceApp(135, "2026-05-29T15:00:00", [
      {
        start_time: "2026-05-29T15:00:00",
        duration_minutes: 95,
        duration_active: 35,
        duration_processing: 30,
        need_processing: true,
        staff_id: 56,
      },
    ]);
    const other = singleServiceApp(200, "2026-05-29T15:40:00", 20, 56);
    const laid = buildAgendaLanes(
      [pair(color), pair(other)],
      SLOT_PX,
    );
    expect(laid[0]!.laneCount).toBe(1);
    expect(laid[1]!.laneCount).toBe(1);
    expect(laid[0]!.laneIndex).toBe(0);
    expect(laid[1]!.laneIndex).toBe(0);
  });

  it("posa valida: overlap in fase attiva → laneCount 2", () => {
    const color = multiServiceApp(135, "2026-05-29T15:00:00", [
      {
        start_time: "2026-05-29T15:00:00",
        duration_minutes: 95,
        duration_active: 35,
        duration_processing: 30,
        need_processing: true,
        staff_id: 56,
      },
    ]);
    const other = singleServiceApp(201, "2026-05-29T15:10:00", 20, 56);
    const laid = buildAgendaLanes([pair(color), pair(other)], SLOT_PX);
    expect(laid[0]!.laneCount).toBe(2);
    expect(laid[1]!.laneCount).toBe(2);
  });

  it("staff diversi: due colonne separate (nessuna collisione in un singolo build)", () => {
    const app = multiServiceApp(70, "2026-05-29T15:15:00", [
      { start_time: "2026-05-29T15:15:00", duration_minutes: 60, staff_id: 56 },
      { start_time: "2026-05-29T15:15:00", duration_minutes: 60, staff_id: 99 },
    ]);
    const [lineA, lineB] = getAgendaDisplayServiceLines(app);
    expect(lineA.staff_id).toBe(56);
    expect(lineB.staff_id).toBe(99);

    const laidA = buildAgendaLanes([pair(app, lineA)], SLOT_PX);
    const laidB = buildAgendaLanes([pair(app, lineB)], SLOT_PX);

    expect(laidA[0]!.laneCount).toBe(1);
    expect(laidB[0]!.laneCount).toBe(1);
  });
});
