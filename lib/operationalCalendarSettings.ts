import { normalizeScheduleTime, scheduleTimeToMinutes } from "@/lib/staffSchedule";

export type OperationalExceptionFormKind =
  | "open_extra"
  | "closed"
  | "staff_available"
  | "staff_unavailable";

export type SalonOperationalDayRow = {
  id: number;
  salon_id: number;
  operative_date: string;
  kind: "open_extra" | "closed";
  open_start_time: string | null;
  open_end_time: string | null;
  notes: string | null;
};

export type StaffScheduleOverrideRow = {
  id: number;
  salon_id: number;
  staff_id: number;
  staff_name: string;
  operative_date: string;
  kind: "available" | "unavailable";
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
};

export type OperationalCalendarMonthData = {
  salonDays: SalonOperationalDayRow[];
  staffOverrides: StaffScheduleOverrideRow[];
};

export type OperationalCalendarCard =
  | {
      cardKey: string;
      kind: "salon";
      id: number;
      operative_date: string;
      salonKind: "open_extra" | "closed";
      open_start_time: string | null;
      open_end_time: string | null;
      notes: string | null;
    }
  | {
      cardKey: string;
      kind: "staff";
      id: number;
      operative_date: string;
      staff_id: number;
      staff_name: string;
      staffKind: "available" | "unavailable";
      start_time: string | null;
      end_time: string | null;
      notes: string | null;
    };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;

export function parseYearMonth(yearMonth: string): {
  year: number;
  month: number;
  from: string;
  to: string;
  label: string;
} | null {
  const m = String(yearMonth).trim().match(YEAR_MONTH_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(year, month - 1, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
  return { year, month, from, to, label };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftYearMonth(yearMonth: string, delta: number): string | null {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return null;
  let y = parsed.year;
  let m = parsed.month + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return formatYearMonth(y, m);
}

export function currentYearMonthRome(): string {
  const now = new Date();
  return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
}

export function validateIsoDate(isoDate: string): string | null {
  if (!ISO_DATE_RE.test(isoDate.trim())) {
    return "Data non valida (usa il formato AAAA-MM-GG).";
  }
  const [y, mo, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return "Data non valida.";
  }
  return null;
}

export function validateTimeWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const s = normalizeScheduleTime(start ?? null);
  const e = normalizeScheduleTime(end ?? null);
  if (!s && !e) return null;
  if ((s && !e) || (!s && e)) return null;
  const sm = scheduleTimeToMinutes(s);
  const em = scheduleTimeToMinutes(e);
  if (sm == null || em == null) return "Orari non validi.";
  if (em <= sm) return "L'orario di fine deve essere successivo all'inizio.";
  return null;
}

export function normalizeOptionalTime(value: string | null | undefined): string | null {
  const n = normalizeScheduleTime(value ?? null);
  return n;
}

export function mergeOperationalCalendarCards(
  data: OperationalCalendarMonthData,
): OperationalCalendarCard[] {
  const cards: OperationalCalendarCard[] = [];

  for (const row of data.salonDays) {
    cards.push({
      cardKey: `salon-${row.id}`,
      kind: "salon",
      id: row.id,
      operative_date: row.operative_date,
      salonKind: row.kind,
      open_start_time: row.open_start_time,
      open_end_time: row.open_end_time,
      notes: row.notes,
    });
  }

  for (const row of data.staffOverrides) {
    cards.push({
      cardKey: `staff-${row.id}`,
      kind: "staff",
      id: row.id,
      operative_date: row.operative_date,
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      staffKind: row.kind,
      start_time: row.start_time,
      end_time: row.end_time,
      notes: row.notes,
    });
  }

  cards.sort((a, b) => {
    const d = a.operative_date.localeCompare(b.operative_date);
    if (d !== 0) return d;
    if (a.kind === "salon" && b.kind === "staff") return -1;
    if (a.kind === "staff" && b.kind === "salon") return 1;
    return a.cardKey.localeCompare(b.cardKey);
  });

  return cards;
}

export function formatOperationalDateIt(isoDate: string): string {
  const [y, mo, d] = isoDate.split("-").map(Number);
  if (!y || !mo || !d) return isoDate;
  return new Date(y, mo - 1, d).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTimeRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

export const OPERATIONAL_BADGE: Record<
  OperationalExceptionFormKind,
  { label: string; className: string }
> = {
  open_extra: {
    label: "Aperto extra",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  },
  closed: {
    label: "Chiuso",
    className: "border-red-500/35 bg-red-500/10 text-red-200",
  },
  staff_available: {
    label: "Staff disponibile",
    className: "border-sky-500/35 bg-sky-500/10 text-sky-200",
  },
  staff_unavailable: {
    label: "Staff non disponibile",
    className: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  },
};
