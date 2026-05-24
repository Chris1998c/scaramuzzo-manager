import { describe, expect, it } from "vitest";

import { resolveReportNavigation } from "@/lib/reportSalonResolve";

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
