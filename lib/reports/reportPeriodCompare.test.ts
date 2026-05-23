import { describe, expect, it } from "vitest";

import {
  isoDateOffset,
  sameWeekdayLastWeek,
  startOfMonthISO,
  startOfWeekISO,
  yesterdayISO,
} from "@/lib/reports/reportPeriodCompare";

describe("reportPeriodCompare", () => {
  it("yesterdayISO", () => {
    expect(yesterdayISO("2026-05-23")).toBe("2026-05-22");
  });

  it("sameWeekdayLastWeek", () => {
    expect(sameWeekdayLastWeek("2026-05-23")).toBe("2026-05-16");
  });

  it("isoDateOffset", () => {
    expect(isoDateOffset("2026-05-01", 3)).toBe("2026-05-04");
  });

  it("startOfMonthISO", () => {
    expect(startOfMonthISO(new Date("2026-05-23T10:00:00"))).toBe("2026-05-01");
  });

  it("startOfWeekISO — venerdì → lunedì stessa settimana", () => {
    expect(startOfWeekISO("2026-05-22")).toBe("2026-05-18");
  });
});
