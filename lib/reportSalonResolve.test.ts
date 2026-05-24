import { describe, expect, it } from "vitest";

import {
  pickDefaultSalonIdForReport,
  resolveReportNavigation,
} from "@/lib/reportSalonResolve";
import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

describe("resolveReportNavigation", () => {
  it("accetta tab cassa-audit con trattino", () => {
    const nav = resolveReportNavigation("cassa-audit", "cassa");
    expect(nav.macro).toBe("cassa_audit");
    expect(nav.cassaAuditSubtab).toBe("cassa");
    expect(nav.exportTab).toBe("cassa");
  });

  it("risolve macro clienti e team", () => {
    expect(resolveReportNavigation("clienti").macro).toBe("clienti");
    expect(resolveReportNavigation("team").exportTab).toBe("staff");
  });

  it("fallback riepilogo su tab sconosciuta", () => {
    expect(resolveReportNavigation("unknown-tab").macro).toBe("riepilogo");
  });
});

describe("pickDefaultSalonIdForReport", () => {
  it("non usa Magazzino Centrale come default se ci sono saloni operativi", () => {
    expect(pickDefaultSalonIdForReport([1, 2, 3, 4, MAGAZZINO_CENTRALE_ID], MAGAZZINO_CENTRALE_ID)).toBe(
      1,
    );
  });

  it("preferisce default operativo del profilo", () => {
    expect(pickDefaultSalonIdForReport([2, 3, MAGAZZINO_CENTRALE_ID], 3)).toBe(3);
  });
});
