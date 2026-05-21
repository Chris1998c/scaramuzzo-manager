import { describe, expect, it } from "vitest";
import {
  filterStaffForAgendaDay,
  isoDayOfWeekFromISODateLocal,
  isStaffOffScheduleForAgendaDay,
  isStaffVisibleOnAgendaDayForSalon,
} from "@/lib/staffSchedule";

describe("staff schedule enforcement rules", () => {
  it("isoDayOfWeekFromISODateLocal: giovedì 2026-05-21", () => {
    expect(isoDayOfWeekFromISODateLocal("2026-05-21")).toBe(4);
  });

  it("legacy: staff senza righe schedule → tutti i giorni", () => {
    const map = new Map<string, Set<number>>();
    expect(isStaffVisibleOnAgendaDayForSalon(map, "42", 3)).toBe(true);
  });

  it("con turni: solo giorni nel set", () => {
    const map = new Map<string, Set<number>>([["42", new Set([1, 2])]]);
    expect(isStaffVisibleOnAgendaDayForSalon(map, "42", 1)).toBe(true);
    expect(isStaffVisibleOnAgendaDayForSalon(map, "42", 5)).toBe(false);
  });

  it("filterStaffForAgendaDay include valore assegnato fuori turno", () => {
    const map = new Map<string, Set<number>>([
      ["42", new Set([1])],
      ["99", new Set([1, 2, 3])],
    ]);
    const rows = [
      { id: 42, name: "A" },
      { id: 99, name: "B" },
    ];
    const filtered = filterStaffForAgendaDay(rows, map, "2026-05-21", [42]);
    expect(filtered.map((r) => r.id)).toEqual([42]);
  });

  it("isStaffOffScheduleForAgendaDay", () => {
    const map = new Map<string, Set<number>>([["42", new Set([1])]]);
    expect(isStaffOffScheduleForAgendaDay(map, 42, "2026-05-21")).toBe(true);
    expect(isStaffOffScheduleForAgendaDay(map, 99, "2026-05-21")).toBe(false);
  });
});
