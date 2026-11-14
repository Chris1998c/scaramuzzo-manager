import {
  attendanceRowsToCsv,
  buildAttendanceExportCsvRows,
} from "@/lib/attendance/attendanceExportRows";
import { loadAttendanceDailySummary } from "@/lib/attendance/loadAttendanceDailySummary";
import { resolveAttendanceQuery } from "@/lib/attendance/resolveAttendanceQuery";
import { todayRomeBusinessDate } from "@/lib/attendance/attendanceDailySummary";
import { requireAttendanceWebAccess } from "@/lib/attendanceWebAccess";
import { salonLabel } from "@/lib/constants";
import { reportExportPeriodError } from "@/lib/reports/reportDateRange";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const gate = await requireAttendanceWebAccess();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const resolved = resolveAttendanceQuery({
    access: gate.access,
    salonIdRaw: url.searchParams.get("salon_id"),
    staffIdRaw: url.searchParams.get("staff_id"),
    dateFromRaw: url.searchParams.get("date_from"),
    dateToRaw: url.searchParams.get("date_to"),
    todayRome: todayRomeBusinessDate(),
  });

  const periodErr = reportExportPeriodError(resolved.dateRange.spanDays);
  if (periodErr) {
    return new Response(JSON.stringify({ error: periodErr }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (resolved.querySalonIds !== null && resolved.querySalonIds.length === 0) {
    const csv = attendanceRowsToCsv([]);
    return new Response(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="presenze-vuoto.csv"`,
      },
    });
  }

  try {
    const rows = await loadAttendanceDailySummary({
      querySalonIds: resolved.querySalonIds,
      salonId: resolved.salonId,
      staffId: resolved.staffId,
      dateFrom: resolved.dateRange.dateFrom,
      dateTo: resolved.dateRange.dateTo,
    });

    const csv = attendanceRowsToCsv(buildAttendanceExportCsvRows(rows));
    const salonPart =
      resolved.salonId != null
        ? salonLabel(resolved.salonId).replace(/\s+/g, "-").toLowerCase()
        : "tutti-saloni";
    const filename = `presenze-${salonPart}-${resolved.dateRange.dateFrom}_${resolved.dateRange.dateTo}.csv`;

    return new Response(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("attendance export csv error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
