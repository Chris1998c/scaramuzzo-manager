import { describe, expect, it } from "vitest";
import {
  assertBatchInternalStaffSlotsFree,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import {
  buildContiguousAgendaLines,
  buildLegacySnappedPerLineAgendaStarts,
} from "@/lib/agenda/buildContiguousAgendaLines";

describe("buildContiguousAgendaLines", () => {
  it("20+30: seconda riga a 10:20 senza overlap interno", () => {
    const built = buildContiguousAgendaLines("2026-06-15T10:00:00", [
      { duration_minutes: 20, staffId: 7 },
      { duration_minutes: 30, staffId: 7 },
    ]);

    expect(built.map((l) => l.start_time)).toEqual([
      "2026-06-15T10:00:00",
      "2026-06-15T10:20:00",
    ]);
    expect(() =>
      assertBatchInternalStaffSlotsFree(
        built.map((l) => ({
          staffId: l.staffId,
          startTime: l.start_time,
          durationMinutes: l.duration_minutes,
        })),
      ),
    ).not.toThrow();
  });

  it("35+20: contigue dopo snap solo della prima", () => {
    const built = buildContiguousAgendaLines("2026-06-15T10:07:00", [
      { duration_minutes: 35 },
      { duration_minutes: 20 },
    ]);
    expect(built[0]!.start_time).toBe("2026-06-15T10:00:00");
    expect(built[1]!.start_time).toBe("2026-06-15T10:35:00");
  });

  it("legacy snap-per-riga su 20+30 crea overlap interno (bug manager pre-fix)", () => {
    const legacyStarts = buildLegacySnappedPerLineAgendaStarts("2026-06-15T10:00:00", [
      20, 30,
    ]);
    expect(legacyStarts).toEqual(["2026-06-15T10:00:00", "2026-06-15T10:15:00"]);
    expect(() =>
      assertBatchInternalStaffSlotsFree([
        { staffId: 1, startTime: legacyStarts[0]!, durationMinutes: 20 },
        { staffId: 1, startTime: legacyStarts[1]!, durationMinutes: 30 },
      ]),
    ).toThrow(STAFF_SLOT_CONFLICT_MESSAGE);
  });
});
