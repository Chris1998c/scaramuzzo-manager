/**
 * Riepilogo presenze condiviso (pagina, daily-summary API, export CSV/PDF).
 * Una riga = collaboratore + salone + giorno operativo Europe/Rome.
 */

import { parseInstantUtcAware } from "@/lib/datetime/formatRomeInstant";
import {
  romeBusinessDateFromInstant,
  romeBusinessDateFromUtcWall,
  romeLocalMidnightToUtcMs,
} from "@/lib/datetime/romeBusinessDate";

export type AttendanceLogEvent = {
  staff_id: number;
  salon_id: number;
  type: string;
  created_at: string;
};

export type AttendanceDailySummaryRow = {
  staff_id: number;
  staff_name: string | null;
  salon_id: number;
  day: string;
  first_clock_in_at: string | null;
  last_clock_out_at: string | null;
  worked_minutes: number;
  /** Turno non chiuso correttamente (doppio in, out orfano, o in ancora aperto). */
  is_incomplete: boolean;
  /** True se su questa riga (giorno/salone) resta un clock-in senza out. */
  has_open_shift: boolean;
};

type Accumulator = {
  staff_id: number;
  salon_id: number;
  day: string;
  first_clock_in_at: string | null;
  last_clock_out_at: string | null;
  worked_minutes: number;
  is_incomplete: boolean;
  openClockInAt: Date | null;
};

export type AttendanceSummaryFilters = {
  /** null = tutti i saloni consentiti (già applicati in query). */
  salonId?: number | null;
  staffId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

/** Bounds ISO timestamptz inclusivo/esclusivo per range giorni Rome (CET/CEST-safe). */
export function timestamptzBoundsForRomeDateRange(
  dateFrom: string,
  dateTo: string,
): { gteIso: string; ltIso: string } {
  const startMs = romeLocalMidnightToUtcMs(dateFrom);
  const [y, m, d] = dateTo.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  const nextYmd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const endMs = romeLocalMidnightToUtcMs(nextYmd);
  return {
    gteIso: new Date(startMs).toISOString(),
    ltIso: new Date(endMs).toISOString(),
  };
}

export function buildAttendanceDailySummary(params: {
  events: AttendanceLogEvent[];
  staffNameById: Map<number, string | null>;
  filters?: AttendanceSummaryFilters;
}): AttendanceDailySummaryRow[] {
  const salonId = params.filters?.salonId ?? null;
  const staffId = params.filters?.staffId ?? null;
  const dateFrom = params.filters?.dateFrom ?? null;
  const dateTo = params.filters?.dateTo ?? null;

  const summaryByKey = new Map<string, Accumulator>();

  for (const event of params.events) {
    if (salonId != null && event.salon_id !== salonId) continue;
    if (staffId != null && event.staff_id !== staffId) continue;

    const day = romeBusinessDateFromUtcWall(event.created_at);
    const createdAtDate = parseInstantUtcAware(event.created_at);
    if (!day || !createdAtDate) continue;
    if (dateFrom && day < dateFrom) continue;
    if (dateTo && day > dateTo) continue;

    const key = `${event.staff_id}:${event.salon_id}:${day}`;
    let summary = summaryByKey.get(key);
    if (!summary) {
      summary = {
        staff_id: event.staff_id,
        salon_id: event.salon_id,
        day,
        first_clock_in_at: null,
        last_clock_out_at: null,
        worked_minutes: 0,
        is_incomplete: false,
        openClockInAt: null,
      };
      summaryByKey.set(key, summary);
    }

    if (event.type === "in") {
      if (summary.first_clock_in_at === null) {
        summary.first_clock_in_at = event.created_at;
      }
      if (summary.openClockInAt !== null) {
        summary.is_incomplete = true;
      }
      summary.openClockInAt = createdAtDate;
      continue;
    }

    if (event.type === "out") {
      if (summary.openClockInAt === null) {
        summary.is_incomplete = true;
        continue;
      }
      const diffMs = createdAtDate.getTime() - summary.openClockInAt.getTime();
      if (diffMs < 0) {
        summary.is_incomplete = true;
        summary.openClockInAt = null;
        continue;
      }
      summary.worked_minutes += Math.floor(diffMs / 60_000);
      summary.last_clock_out_at = event.created_at;
      summary.openClockInAt = null;
    }
  }

  for (const summary of summaryByKey.values()) {
    if (summary.openClockInAt !== null) {
      summary.is_incomplete = true;
    }
  }

  return Array.from(summaryByKey.values())
    .map((summary) => ({
      staff_id: summary.staff_id,
      staff_name: params.staffNameById.get(summary.staff_id) ?? null,
      salon_id: summary.salon_id,
      day: summary.day,
      first_clock_in_at: summary.first_clock_in_at,
      last_clock_out_at: summary.last_clock_out_at,
      worked_minutes: summary.worked_minutes,
      is_incomplete: summary.is_incomplete,
      has_open_shift: summary.openClockInAt !== null,
    }))
    .sort((a, b) => {
      if (a.day !== b.day) return b.day.localeCompare(a.day);
      if (a.salon_id !== b.salon_id) return a.salon_id - b.salon_id;
      const nameA = (a.staff_name ?? "").toLocaleLowerCase();
      const nameB = (b.staff_name ?? "").toLocaleLowerCase();
      return nameA.localeCompare(nameB);
    });
}

/** Live per riga: solo se questa giornata/salone ha ancora un turno aperto. */
export function liveStatusForRow(
  row: Pick<AttendanceDailySummaryRow, "has_open_shift">,
): "inside" | "outside" {
  return row.has_open_shift ? "inside" : "outside";
}

/** Conta collaboratori unici attualmente dentro (turno aperto sulla riga). */
export function countStaffLiveInside(rows: AttendanceDailySummaryRow[]): number {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.has_open_shift) ids.add(row.staff_id);
  }
  return ids.size;
}

export type AttendanceStaffTotal = {
  staff_id: number;
  staff_name: string | null;
  closed_days: number;
  incomplete_days: number;
  worked_minutes: number;
};

export function totalsByStaff(rows: AttendanceDailySummaryRow[]): AttendanceStaffTotal[] {
  const map = new Map<number, AttendanceStaffTotal>();
  for (const row of rows) {
    let t = map.get(row.staff_id);
    if (!t) {
      t = {
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        closed_days: 0,
        incomplete_days: 0,
        worked_minutes: 0,
      };
      map.set(row.staff_id, t);
    }
    t.worked_minutes += row.worked_minutes;
    if (row.is_incomplete) t.incomplete_days += 1;
    else t.closed_days += 1;
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.staff_name ?? "").localeCompare(b.staff_name ?? "", "it"),
  );
}

export function todayRomeBusinessDate(now: Date = new Date()): string {
  return romeBusinessDateFromInstant(now);
}

export function hoursFromMinutes(minutes: number): string {
  return (minutes / 60).toFixed(2);
}
