import { describe, expect, it } from "vitest";

import {
  agendaTimeFromTs,
  parseAgendaLocalTs,
  splitAgendaTimestamp,
} from "@/lib/agenda/agendaTimestamp";

describe("agendaTimestamp", () => {
  it("split con T ISO", () => {
    expect(splitAgendaTimestamp("2026-05-29T15:15:00")).toEqual({
      date: "2026-05-29",
      time: "15:15:00",
    });
  });

  it("split con spazio Postgres", () => {
    expect(splitAgendaTimestamp("2026-05-29 15:50:00")).toEqual({
      date: "2026-05-29",
      time: "15:50:00",
    });
  });

  it("agendaTimeFromTs con spazio → HH:MM corretto", () => {
    expect(agendaTimeFromTs("2026-05-29 15:50:00")).toBe("15:50");
    expect(agendaTimeFromTs("2026-05-29T15:50:00")).toBe("15:50");
  });

  it("parseAgendaLocalTs con spazio", () => {
    const d = parseAgendaLocalTs("2026-05-29 15:50:00");
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(50);
  });
});
