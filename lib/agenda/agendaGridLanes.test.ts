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
  lines: Array<{ start_time: string; duration_minutes: number }>,
): AgendaAppointment {
  return {
    id,
    start_time: start,
    end_time: "2026-05-29T18:00:00",
    status: "scheduled",
    sale_id: null,
    notes: null,
    staff_id: 56,
    customer_id: "c1",
    customers: { first_name: "A", last_name: "B" },
    appointment_services: lines.map((ln, i) => ({
      id: id * 10 + i,
      appointment_id: id,
      service_id: i + 1,
      start_time: ln.start_time,
      duration_minutes: ln.duration_minutes,
      staff_id: 56,
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
  return multiServiceApp(id, start_time, [{ start_time, duration_minutes }]);
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

    const laid = buildAgendaLanes([pair(appA), pair(appB)], SLOT_PX);

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

  it("multi-servizio 80 min partecipa alla collisione (non 35 min catalogo)", () => {
    const appA = multiServiceApp(129, "2026-05-29T15:15:00", [
      { start_time: "2026-05-29 15:15:00", duration_minutes: 35 },
      { start_time: "2026-05-29 15:50:00", duration_minutes: 45 },
    ]);
    const displayA = getAgendaDisplayServiceLines(appA)[0]!;
    expect(displayA.duration_minutes).toBe(80);

    const appB = singleServiceApp(130, "2026-05-29T16:00:00", 30);

    const laid = buildAgendaLanes([pair(appA), pair(appB)], SLOT_PX);

    expect(laid[0]!.laneCount).toBe(2);
    expect(laid[1]!.laneCount).toBe(2);
  });

  it("staff diversi: due colonne separate (nessuna collisione in un singolo build)", () => {
    const appA = singleServiceApp(1, "2026-05-29T15:15:00", 60, 56);
    const appB = singleServiceApp(2, "2026-05-29T15:15:00", 60, 99);

    const laidA = buildAgendaLanes([pair(appA)], SLOT_PX);
    const laidB = buildAgendaLanes([pair(appB)], SLOT_PX);

    expect(laidA[0]!.laneCount).toBe(1);
    expect(laidB[0]!.laneCount).toBe(1);
  });
});
