import { salonLabel } from "@/lib/constants";
import { formatRomeDateTime } from "@/lib/datetime/formatRomeInstant";
import {
  type AttendanceDailySummaryRow,
  hoursFromMinutes,
  totalsByStaff,
} from "@/lib/attendance/attendanceDailySummary";

function fmtDt(value: string | null): string {
  if (!value) return "";
  const formatted = formatRomeDateTime(value);
  return formatted === "—" ? "" : formatted;
}

/** Righe CSV Excel (sep=;): dettaglio + totali collaboratore. Incomplete non contano come turni chiusi. */
export function buildAttendanceExportDetailRows(
  rows: AttendanceDailySummaryRow[],
): Record<string, string | number>[] {
  return rows.map((row) => ({
    Giorno: row.day,
    Collaboratore: row.staff_name ?? "",
    Salone: salonLabel(row.salon_id),
    Entrata: fmtDt(row.first_clock_in_at),
    Uscita: fmtDt(row.last_clock_out_at),
    Minuti: row.worked_minutes,
    Ore: hoursFromMinutes(row.worked_minutes),
    Stato: row.is_incomplete ? "INCOMPLETA" : "OK",
    Live: row.has_open_shift ? "Dentro ora" : "Fuori ora",
  }));
}

export function buildAttendanceExportTotalRows(
  rows: AttendanceDailySummaryRow[],
): Record<string, string | number>[] {
  return totalsByStaff(rows).map((t) => ({
    Giorno: "TOTALE",
    Collaboratore: t.staff_name ?? "",
    Salone: "",
    Entrata: "",
    Uscita: "",
    Minuti: t.worked_minutes,
    Ore: hoursFromMinutes(t.worked_minutes),
    Stato: `Turni chiusi: ${t.closed_days}; Incomplete: ${t.incomplete_days} (non conteggiate come chiusi)`,
    Live: "",
  }));
}

export function buildAttendanceExportCsvRows(
  rows: AttendanceDailySummaryRow[],
): Record<string, string | number>[] {
  return [...buildAttendanceExportDetailRows(rows), ...buildAttendanceExportTotalRows(rows)];
}

export function escCsvCell(v: unknown): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV leggibile in Excel IT (sep=; + BOM opzionale lato route). */
export function attendanceRowsToCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "sep=;\n";
  const headers = Object.keys(rows[0]!);
  const lines = [
    "sep=;",
    headers.map(escCsvCell).join(";"),
    ...rows.map((r) => headers.map((h) => escCsvCell(r[h])).join(";")),
  ];
  return `${lines.join("\n")}\n`;
}
