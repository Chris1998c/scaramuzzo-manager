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

  describe("macro cassa_audit + subtab query", () => {
    it("rispetta subtab validi", () => {
      expect(resolveReportNavigation("cassa_audit", "agenda")).toMatchObject({
        macro: "cassa_audit",
        cassaAuditSubtab: "agenda",
        exportTab: "agenda",
      });
      expect(resolveReportNavigation("cassa_audit", "whatsapp")).toMatchObject({
        macro: "cassa_audit",
        cassaAuditSubtab: "whatsapp",
        exportTab: null,
      });
      expect(resolveReportNavigation("cassa-audit", "cassa")).toMatchObject({
        macro: "cassa_audit",
        cassaAuditSubtab: "cassa",
        exportTab: "cassa",
      });
    });

    it("default cassa se subtab assente", () => {
      expect(resolveReportNavigation("cassa_audit")).toMatchObject({
        macro: "cassa_audit",
        cassaAuditSubtab: "cassa",
        exportTab: "cassa",
      });
    });

    it("default cassa se subtab non valido", () => {
      expect(resolveReportNavigation("cassa_audit", "nope")).toMatchObject({
        macro: "cassa_audit",
        cassaAuditSubtab: "cassa",
        exportTab: "cassa",
      });
    });
  });

  describe("macro vendite + subtab query", () => {
    it("rispetta subtab validi", () => {
      expect(resolveReportNavigation("vendite", "giorni")).toMatchObject({
        macro: "vendite",
        venditeSubtab: "giorni",
        exportTab: "daily",
      });
      expect(resolveReportNavigation("vendite", "servizi")).toMatchObject({
        macro: "vendite",
        venditeSubtab: "servizi",
        exportTab: "servizi",
      });
      expect(resolveReportNavigation("vendite", "prodotti")).toMatchObject({
        macro: "vendite",
        venditeSubtab: "prodotti",
        exportTab: "prodotti",
      });
      expect(resolveReportNavigation("vendite", "dettaglio")).toMatchObject({
        macro: "vendite",
        venditeSubtab: "dettaglio",
        exportTab: "turnover",
      });
    });

    it("default totali se subtab assente", () => {
      expect(resolveReportNavigation("vendite")).toMatchObject({
        macro: "vendite",
        venditeSubtab: "totali",
        exportTab: "turnover",
      });
    });

    it("default totali se subtab non valido", () => {
      expect(resolveReportNavigation("vendite", "xyz")).toMatchObject({
        macro: "vendite",
        venditeSubtab: "totali",
        exportTab: "turnover",
      });
    });
  });

  it("mantiene deep link legacy senza query subtab", () => {
    expect(resolveReportNavigation("daily")).toMatchObject({
      macro: "vendite",
      venditeSubtab: "giorni",
      exportTab: "daily",
    });
    expect(resolveReportNavigation("agenda")).toMatchObject({
      macro: "cassa_audit",
      cassaAuditSubtab: "agenda",
      exportTab: "agenda",
    });
    expect(resolveReportNavigation("cassa")).toMatchObject({
      macro: "cassa_audit",
      cassaAuditSubtab: "cassa",
      exportTab: "cassa",
    });
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
