import { MAGAZZINO_CENTRALE_ID } from "@/lib/constants";

/** Allineato a dashboard / Vista coordinator: hub se presente, poi default access, poi primo consentito. */
export function pickDefaultSalonIdForReport(
  allowedSalonIds: number[],
  defaultSalonId: number | null | undefined,
): number | null {
  if (!allowedSalonIds.length) return null;
  if (allowedSalonIds.includes(MAGAZZINO_CENTRALE_ID)) return MAGAZZINO_CENTRALE_ID;
  if (defaultSalonId != null && allowedSalonIds.includes(defaultSalonId)) return defaultSalonId;
  return allowedSalonIds[0] ?? null;
}

export const REPORT_TAB_KEYS = [
  "turnover",
  "daily",
  "top",
  "staff",
  "cassa",
  "agenda",
  "clienti",
  "servizi",
  "prodotti",
  "whatsapp_reminders",
] as const;

export type ReportTabKey = (typeof REPORT_TAB_KEYS)[number];

export function normalizeReportTab(raw: unknown): ReportTabKey {
  const s =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw) && raw.length
        ? String(raw[0])
        : "";
  return (REPORT_TAB_KEYS as readonly string[]).includes(s) ? (s as ReportTabKey) : "turnover";
}
