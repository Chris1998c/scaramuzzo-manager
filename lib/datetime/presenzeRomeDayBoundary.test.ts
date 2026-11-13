import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatRomeDateTime } from "@/lib/datetime/formatRomeInstant";
import { romeBusinessDateFromUtcWall } from "@/lib/datetime/romeBusinessDate";

const DAILY_SUMMARY = "app/api/attendance/daily-summary/route.ts";

describe("Presenze day boundary Europe/Rome (CET/CEST)", () => {
  it("daily-summary query non esclude istanti: nessun range su created_at", () => {
    const src = readFileSync(join(process.cwd(), DAILY_SUMMARY), "utf8");
    // Solo filtro salone opzionale; confini CET/CEST restano nella result set.
    expect(src).toMatch(/\.from\("attendance_logs"\)/);
    expect(src).not.toMatch(
      /\.from\("attendance_logs"\)[\s\S]*?\.(gte|gt|lte|lt|filter)\(\s*["']created_at["']/,
    );
    expect(src).toMatch(/romeBusinessDateFromUtcWall/);
  });

  it("CET: mezzanotte Rome — 22:30Z resta 13/11, 23:30Z passa al 14/11", () => {
    expect(romeBusinessDateFromUtcWall("2026-11-13T22:30:00.000Z")).toBe(
      "2026-11-13",
    );
    expect(formatRomeDateTime("2026-11-13T22:30:00.000Z")).toBe(
      "13/11/2026, 23:30:00",
    );

    expect(romeBusinessDateFromUtcWall("2026-11-13T23:30:00.000Z")).toBe(
      "2026-11-14",
    );
    expect(formatRomeDateTime("2026-11-13T23:30:00.000Z")).toBe(
      "14/11/2026, 00:30:00",
    );
  });

  it("CEST: mezzanotte Rome — 21:30Z resta 13/07, 22:30Z passa al 14/07", () => {
    expect(romeBusinessDateFromUtcWall("2026-07-13T21:30:00.000Z")).toBe(
      "2026-07-13",
    );
    expect(formatRomeDateTime("2026-07-13T21:30:00.000Z")).toBe(
      "13/07/2026, 23:30:00",
    );

    expect(romeBusinessDateFromUtcWall("2026-07-13T22:30:00.000Z")).toBe(
      "2026-07-14",
    );
    expect(formatRomeDateTime("2026-07-13T22:30:00.000Z")).toBe(
      "14/07/2026, 00:30:00",
    );
  });

  it("naive UTC wall (PostgREST senza offset) stessa bucket Rome", () => {
    expect(romeBusinessDateFromUtcWall("2026-11-13T23:30:00.000")).toBe(
      "2026-11-14",
    );
    expect(romeBusinessDateFromUtcWall("2026-07-13T22:30:00.000")).toBe(
      "2026-07-14",
    );
  });

  it("SARA 13/11: giorno bucket = 2026-11-13 (non shiftato)", () => {
    expect(romeBusinessDateFromUtcWall("2026-11-13 17:42:41.847647+00")).toBe(
      "2026-11-13",
    );
  });
});
