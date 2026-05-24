import { nowRomeLocalDate } from "@/lib/agenda/agendaContract";

/** service_ids da query ripetuti, service_ids[] o lista separata da virgole. */
export function parseCustomerAppServiceIds(url: URL): number[] | null {
  const raw: string[] = [
    ...url.searchParams.getAll("service_ids"),
    ...url.searchParams.getAll("service_ids[]"),
  ];

  if (raw.length === 0) {
    const single = url.searchParams.get("service_ids");
    if (single) raw.push(single);
  }

  const tokens: string[] = [];
  for (const v of raw) {
    if (v.includes(",")) tokens.push(...v.split(","));
    else tokens.push(v);
  }

  const ids = [
    ...new Set(
      tokens
        .map((v) => Number(String(v).trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];

  return ids.length ? ids : null;
}

export function parseCustomerAppIsoDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return s;
}

export function isPastCustomerAppDate(isoDate: string): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(nowRomeLocalDate());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const today = `${get("year")}-${get("month")}-${get("day")}`;
  return isoDate < today;
}

export function parseOptionalPositiveInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** @deprecated alias */
export const parseOptionalStaffId = parseOptionalPositiveInt;
