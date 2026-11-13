import { describe, expect, it } from "vitest";
import {
  formatRomeDateTime,
  formatRomeTimeHHmm,
  parseInstantUtcAware,
} from "@/lib/datetime/formatRomeInstant";

describe("formatRomeInstant", () => {
  it("collaudo invernale: cash opened_at UTC senza fuso → ora Rome CET", () => {
    // Sessione #16: DB 14:53 UTC wall in timestamp without tz; Mac 15:53 Rome
    expect(formatRomeTimeHHmm("2026-11-07T14:53:11.605")).toBe("15:53");
    expect(formatRomeTimeHHmm("2026-11-07 14:53:11.605")).toBe("15:53");
  });

  it("collaudo invernale: job timestamptz UTC → Rome CET (~Epson +1h)", () => {
    // Job #31 created 15:07:27+00 → Rome 16:07 (Epson doc ~16:06)
    expect(formatRomeTimeHHmm("2026-11-07T15:07:27.092222+00")).toBe("16:07");
    expect(formatRomeTimeHHmm("2026-11-07T15:07:27.092222Z")).toBe("16:07");
    // PostgREST a volte omette l'offset su timestamptz
    expect(formatRomeTimeHHmm("2026-11-07T15:07:27.092222")).toBe("16:07");
    expect(formatRomeTimeHHmm("2026-11-07T15:13:02.766151+00")).toBe("16:13");
  });

  it("caso estivo CEST: UTC+2 senza aggiungere un’ora fissa", () => {
    expect(formatRomeTimeHHmm("2026-07-15T14:53:11.605Z")).toBe("16:53");
    expect(formatRomeTimeHHmm("2026-07-15T14:53:11.605")).toBe("16:53");
    expect(formatRomeDateTime("2026-07-15T13:07:00.000Z")).toMatch(/15:07/);
  });

  it("con offset esplicito non doppia-conversione", () => {
    // Già espresso in offset Rome CET (+01)
    expect(formatRomeTimeHHmm("2026-11-07T15:53:11.605+01:00")).toBe("15:53");
  });

  it("parseInstantUtcAware: bare → UTC", () => {
    const d = parseInstantUtcAware("2026-11-07T14:53:11.605");
    expect(d?.toISOString()).toBe("2026-11-07T14:53:11.605Z");
  });

  it("Presenze SARA 13/11 CET: timestamptz UTC → wall Rome (entrata)", () => {
    // DB: 2026-11-13 17:42:41.847647+00 → Rome 18:42:41 (bug UI: toLocaleString UTC = 17:42:41)
    expect(formatRomeDateTime("2026-11-13 17:42:41.847647+00")).toBe(
      "13/11/2026, 18:42:41",
    );
    expect(formatRomeDateTime("2026-11-13T17:42:41.847647+00")).toBe(
      "13/11/2026, 18:42:41",
    );
    expect(formatRomeDateTime("2026-11-13T17:42:41.847647")).toBe(
      "13/11/2026, 18:42:41",
    );
  });

  it("Presenze uscita CET/CEST: stesso formatter, niente ora fissa", () => {
    expect(formatRomeDateTime("2026-11-13T18:05:00.000Z")).toBe(
      "13/11/2026, 19:05:00",
    );
    expect(formatRomeDateTime("2026-07-13T16:42:41.000Z")).toBe(
      "13/07/2026, 18:42:41",
    );
  });
});

