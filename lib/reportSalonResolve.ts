import { MAGAZZINO_CENTRALE_ID, REAL_SALON_IDS } from "@/lib/constants";

export function isOperationalReportSalonId(salonId: number): boolean {
  return (REAL_SALON_IDS as readonly number[]).includes(salonId);
}

/** Default Report/CRM: solo saloni operativi 1–4; Magazzino (5) mai default. */
export function pickDefaultSalonIdForReport(
  allowedSalonIds: number[],
  defaultSalonId: number | null | undefined,
): number | null {
  if (!allowedSalonIds.length) return null;

  const operational = allowedSalonIds.filter((id) => id !== MAGAZZINO_CENTRALE_ID);
  const pool = operational.length ? operational : allowedSalonIds;

  if (
    defaultSalonId != null &&
    defaultSalonId !== MAGAZZINO_CENTRALE_ID &&
    pool.includes(defaultSalonId)
  ) {
    return defaultSalonId;
  }

  for (const id of REAL_SALON_IDS) {
    if (pool.includes(id)) return id;
  }

  return pool[0] ?? null;
}

/** 5 macro sezioni top-level (Sprint 1). */
export const REPORT_MACRO_TAB_KEYS = [
  "riepilogo",
  "team",
  "clienti",
  "vendite",
  "cassa_audit",
] as const;

export type ReportMacroTabKey = (typeof REPORT_MACRO_TAB_KEYS)[number];

export const VENDITE_SUBTAB_KEYS = [
  "totali",
  "giorni",
  "servizi",
  "prodotti",
  "dettaglio",
] as const;

export type VenditeSubtabKey = (typeof VENDITE_SUBTAB_KEYS)[number];

export const CASSA_AUDIT_SUBTAB_KEYS = ["cassa", "agenda", "whatsapp"] as const;

export type CassaAuditSubtabKey = (typeof CASSA_AUDIT_SUBTAB_KEYS)[number];

/** Tab legacy per export API e deep link. */
export const LEGACY_EXPORT_TAB_KEYS = [
  "turnover",
  "daily",
  "top",
  "staff",
  "cassa",
  "agenda",
  "clienti",
  "servizi",
  "prodotti",
] as const;

export type LegacyExportTabKey = (typeof LEGACY_EXPORT_TAB_KEYS)[number];

export type ReportNavigation = {
  macro: ReportMacroTabKey;
  venditeSubtab: VenditeSubtabKey;
  cassaAuditSubtab: CassaAuditSubtabKey;
  /** Tab per export PDF/CSV (formato legacy). */
  exportTab: LegacyExportTabKey | null;
};

const LEGACY_TAB_TO_NAV: Record<string, Partial<ReportNavigation>> = {
  riepilogo: { macro: "riepilogo", exportTab: null },
  team: { macro: "team", exportTab: "staff" },
  staff: { macro: "team", exportTab: "staff" },
  clienti: { macro: "clienti", exportTab: "clienti" },
  vendite: { macro: "vendite", venditeSubtab: "totali", exportTab: "turnover" },
  turnover: { macro: "vendite", venditeSubtab: "totali", exportTab: "turnover" },
  daily: { macro: "vendite", venditeSubtab: "giorni", exportTab: "daily" },
  top: { macro: "vendite", venditeSubtab: "totali", exportTab: "top" },
  servizi: { macro: "vendite", venditeSubtab: "servizi", exportTab: "servizi" },
  prodotti: { macro: "vendite", venditeSubtab: "prodotti", exportTab: "prodotti" },
  dettaglio: { macro: "vendite", venditeSubtab: "dettaglio", exportTab: "turnover" },
  cassa_audit: { macro: "cassa_audit", cassaAuditSubtab: "cassa", exportTab: "cassa" },
  cassa: { macro: "cassa_audit", cassaAuditSubtab: "cassa", exportTab: "cassa" },
  agenda: { macro: "cassa_audit", cassaAuditSubtab: "agenda", exportTab: "agenda" },
  whatsapp: { macro: "cassa_audit", cassaAuditSubtab: "whatsapp", exportTab: null },
  whatsapp_reminders: {
    macro: "cassa_audit",
    cassaAuditSubtab: "whatsapp",
    exportTab: null,
  },
};

function pickSubtab<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const s =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw) && raw.length
        ? String(raw[0])
        : "";
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

export function resolveReportNavigation(
  rawTab: unknown,
  rawSubtab?: unknown,
): ReportNavigation {
  const tabRaw =
    typeof rawTab === "string"
      ? rawTab
      : Array.isArray(rawTab) && rawTab.length
        ? String(rawTab[0])
        : "";
  const tab = tabRaw.replace(/-/g, "_");

  const partial = LEGACY_TAB_TO_NAV[tab];
  const macro = partial?.macro ?? "riepilogo";

  let venditeSubtab: VenditeSubtabKey =
    partial?.venditeSubtab ?? pickSubtab(rawSubtab, VENDITE_SUBTAB_KEYS, "totali");
  let cassaAuditSubtab: CassaAuditSubtabKey =
    partial?.cassaAuditSubtab ??
    pickSubtab(rawSubtab, CASSA_AUDIT_SUBTAB_KEYS, "cassa");

  if (macro === "vendite" && partial?.venditeSubtab == null) {
    venditeSubtab = pickSubtab(rawSubtab, VENDITE_SUBTAB_KEYS, "totali");
  }
  if (macro === "cassa_audit" && partial?.cassaAuditSubtab == null) {
    cassaAuditSubtab = pickSubtab(rawSubtab, CASSA_AUDIT_SUBTAB_KEYS, "cassa");
  }

  let exportTab = partial?.exportTab ?? null;
  if (macro === "vendite") {
    const map: Record<VenditeSubtabKey, LegacyExportTabKey> = {
      totali: "turnover",
      giorni: "daily",
      servizi: "servizi",
      prodotti: "prodotti",
      dettaglio: "turnover",
    };
    exportTab = map[venditeSubtab];
  }
  if (macro === "cassa_audit") {
    const map: Record<CassaAuditSubtabKey, LegacyExportTabKey | null> = {
      cassa: "cassa",
      agenda: "agenda",
      whatsapp: null,
    };
    exportTab = map[cassaAuditSubtab];
  }
  if (macro === "team") exportTab = "staff";
  if (macro === "clienti") exportTab = "clienti";
  if (macro === "riepilogo") exportTab = null;

  return { macro, venditeSubtab, cassaAuditSubtab, exportTab };
}

export const REPORT_MACRO_LABELS: Record<ReportMacroTabKey, string> = {
  riepilogo: "Riepilogo",
  team: "Team",
  clienti: "Clienti",
  vendite: "Vendite",
  cassa_audit: "Cassa / Audit",
};

export const VENDITE_SUBTAB_LABELS: Record<VenditeSubtabKey, string> = {
  totali: "Totali",
  giorni: "Giorni",
  servizi: "Servizi",
  prodotti: "Prodotti",
  dettaglio: "Dettaglio",
};

export const CASSA_AUDIT_SUBTAB_LABELS: Record<CassaAuditSubtabKey, string> = {
  cassa: "Cassa",
  agenda: "Agenda",
  whatsapp: "WhatsApp log",
};

/** @deprecated Usare resolveReportNavigation */
export const REPORT_TAB_KEYS = REPORT_MACRO_TAB_KEYS;
/** @deprecated */
export type ReportTabKey = ReportMacroTabKey;
/** @deprecated */
export function normalizeReportTab(raw: unknown): ReportMacroTabKey {
  return resolveReportNavigation(raw).macro;
}
