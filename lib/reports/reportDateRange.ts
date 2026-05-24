/** Guardrail: periodi oltre questa soglia mostrano warning UI (Team/Clienti) e bloccano export. */
export const REPORT_MAX_PERIOD_DAYS = 366;

export function reportExportPeriodError(
  spanDays: number,
  maxDays: number = REPORT_MAX_PERIOD_DAYS,
): string | null {
  if (spanDays > maxDays) {
    return `Periodo troppo lungo (${spanDays} giorni). L'export è limitato a ${maxDays} giorni: riduci l'intervallo date.`;
  }
  return null;
}

export function isReportIsoDate(v: string | null | undefined): v is string {
  if (!v) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function defaultTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultMonthStartISO(today: string): string {
  const d = new Date(today);
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function daySpanInclusive(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

export type ResolvedReportDateRange = {
  dateFrom: string;
  dateTo: string;
  wasInverted: boolean;
  hadInvalidInput: boolean;
  needsRedirect: boolean;
  spanDays: number;
  exceedsMaxPeriod: boolean;
};

/** Normalizza date report: default mese corrente, corregge invertite/invalid. */
export function resolveReportDateRange(input: {
  dateFrom?: string | null;
  dateTo?: string | null;
  today?: string;
  maxDays?: number;
}): ResolvedReportDateRange {
  const today = input.today ?? defaultTodayISO();
  const monthStart = defaultMonthStartISO(today);
  const maxDays = input.maxDays ?? REPORT_MAX_PERIOD_DAYS;

  const rawFrom = typeof input.dateFrom === "string" ? input.dateFrom.trim() : "";
  const rawTo = typeof input.dateTo === "string" ? input.dateTo.trim() : "";

  const hadInvalidInput =
    (rawFrom.length > 0 && !isReportIsoDate(rawFrom)) ||
    (rawTo.length > 0 && !isReportIsoDate(rawTo));

  let dateFrom = isReportIsoDate(rawFrom) ? rawFrom : monthStart;
  let dateTo = isReportIsoDate(rawTo) ? rawTo : today;

  let wasInverted = false;
  if (dateFrom > dateTo) {
    const tmp = dateFrom;
    dateFrom = dateTo;
    dateTo = tmp;
    wasInverted = true;
  }

  const spanDays = daySpanInclusive(dateFrom, dateTo);

  return {
    dateFrom,
    dateTo,
    wasInverted,
    hadInvalidInput,
    needsRedirect: wasInverted || hadInvalidInput,
    spanDays,
    exceedsMaxPeriod: spanDays > maxDays,
  };
}
