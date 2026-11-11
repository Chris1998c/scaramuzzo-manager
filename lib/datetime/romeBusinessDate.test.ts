import { describe, expect, it } from "vitest";

import {
  romeBusinessDateFromUtcWall,
  utcWallBoundsForRomeBusinessDate,
  utcWallInstantOnRomeBusinessDate,
} from "@/lib/datetime/romeBusinessDate";

describe("romeBusinessDateFromUtcWall", () => {
  it("CET: UTC 23:30 → giorno Rome successivo", () => {
    // 2026-01-14 23:30 UTC = 2026-01-15 00:30 Rome (CET)
    expect(romeBusinessDateFromUtcWall("2026-01-14T23:30:00")).toBe("2026-01-15");
    expect(romeBusinessDateFromUtcWall("2026-01-14 23:30:00")).toBe("2026-01-15");
  });

  it("CET: poco prima di mezzanotte Rome resta sul giorno precedente", () => {
    // 2026-01-14 22:30 UTC = 2026-01-14 23:30 Rome
    expect(romeBusinessDateFromUtcWall("2026-01-14T22:30:00")).toBe("2026-01-14");
  });

  it("CEST: UTC 22:30 → giorno Rome successivo", () => {
    // 2026-07-14 22:30 UTC = 2026-07-15 00:30 Rome (CEST)
    expect(romeBusinessDateFromUtcWall("2026-07-14T22:30:00")).toBe("2026-07-15");
  });

  it("cambio ora legale primavera 2026-03-29", () => {
    // Last CET night: 2026-03-28 22:30 UTC = 2026-03-28 23:30 Rome
    expect(romeBusinessDateFromUtcWall("2026-03-28T22:30:00")).toBe("2026-03-28");
    // After spring forward: 2026-03-29 00:30 UTC = 2026-03-29 02:30 Rome (CEST)
    expect(romeBusinessDateFromUtcWall("2026-03-29T00:30:00")).toBe("2026-03-29");
    // 2026-03-28 23:30 UTC = 2026-03-29 00:30 Rome (still CET until 01:00→02:00)
    expect(romeBusinessDateFromUtcWall("2026-03-28T23:30:00")).toBe("2026-03-29");
  });

  it("cambio ora solare autunno 2026-10-25", () => {
    // 2026-10-24 22:30 UTC = 2026-10-25 00:30 Rome (CEST still)
    expect(romeBusinessDateFromUtcWall("2026-10-24T22:30:00")).toBe("2026-10-25");
    // After fall back: 2026-10-25 00:30 UTC = 2026-10-25 01:30 Rome CET
    expect(romeBusinessDateFromUtcWall("2026-10-25T00:30:00")).toBe("2026-10-25");
  });
});

describe("utcWallBoundsForRomeBusinessDate", () => {
  it("bounds CET includono 23:30 UTC del giorno prima e escludono 23:00 UTC del giorno", () => {
    const { startUtcWall, endUtcWallExclusive } =
      utcWallBoundsForRomeBusinessDate("2026-01-15");
    // Rome 2026-01-15 00:00 CET = 2026-01-14 23:00 UTC
    expect(startUtcWall.startsWith("2026-01-14T23:00:00")).toBe(true);
    // Rome 2026-01-16 00:00 CET = 2026-01-15 23:00 UTC
    expect(endUtcWallExclusive.startsWith("2026-01-15T23:00:00")).toBe(true);

    expect(utcWallInstantOnRomeBusinessDate("2026-01-14T23:30:00", "2026-01-15")).toBe(
      true,
    );
    expect(utcWallInstantOnRomeBusinessDate("2026-01-14T22:30:00", "2026-01-15")).toBe(
      false,
    );
  });

  it("bounds CEST: start = giorno prima 22:00 UTC", () => {
    const { startUtcWall } = utcWallBoundsForRomeBusinessDate("2026-07-15");
    expect(startUtcWall.startsWith("2026-07-14T22:00:00")).toBe(true);
    expect(utcWallInstantOnRomeBusinessDate("2026-07-14T22:30:00", "2026-07-15")).toBe(
      true,
    );
  });
});
