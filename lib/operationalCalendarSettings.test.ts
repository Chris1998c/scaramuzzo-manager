import { describe, expect, it } from "vitest";
import {
  parseYearMonth,
  shiftYearMonth,
  validateIsoDate,
  validateTimeWindow,
} from "@/lib/operationalCalendarSettings";

describe("operationalCalendarSettings", () => {
  it("parseYearMonth bounds", () => {
    expect(parseYearMonth("2026-05")).toEqual({
      year: 2026,
      month: 5,
      from: "2026-05-01",
      to: "2026-05-31",
      label: expect.any(String),
    });
  });

  it("shiftYearMonth", () => {
    expect(shiftYearMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftYearMonth("2026-12", 1)).toBe("2027-01");
  });

  it("validateIsoDate", () => {
    expect(validateIsoDate("2026-05-21")).toBeNull();
    expect(validateIsoDate("bad")).not.toBeNull();
  });

  it("validateTimeWindow", () => {
    expect(validateTimeWindow("10:00", "18:00")).toBeNull();
    expect(validateTimeWindow("18:00", "10:00")).not.toBeNull();
    expect(validateTimeWindow(null, null)).toBeNull();
  });
});
