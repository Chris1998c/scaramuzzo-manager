import { describe, expect, it } from "vitest";
import {
  clampRangeStartToBaseline,
  normalizeBaselineTs,
} from "./operationalBaselineClient";

describe("operationalBaselineClient", () => {
  it("normalizes ISO-ish timestamps to wall form", () => {
    expect(normalizeBaselineTs("2026-11-16T15:01:28.196717Z")).toBe(
      "2026-11-16 15:01:28",
    );
  });

  it("clamps range start to baseline", () => {
    expect(
      clampRangeStartToBaseline("2026-05-01T00:00:00", "2026-11-16 15:01:28"),
    ).toBe("2026-11-16 15:01:28");
    expect(
      clampRangeStartToBaseline("2026-11-17T00:00:00", "2026-11-16 15:01:28"),
    ).toBe("2026-11-17T00:00:00");
    expect(clampRangeStartToBaseline("2026-05-01T00:00:00", null)).toBe(
      "2026-05-01T00:00:00",
    );
  });
});
