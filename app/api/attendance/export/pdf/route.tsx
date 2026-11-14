import { loadAttendanceDailySummary } from "@/lib/attendance/loadAttendanceDailySummary";
import { resolveAttendanceQuery } from "@/lib/attendance/resolveAttendanceQuery";
import { todayRomeBusinessDate } from "@/lib/attendance/attendanceDailySummary";
import { requireAttendanceWebAccess } from "@/lib/attendanceWebAccess";
import { salonLabel } from "@/lib/constants";
import { formatRomeDateTime } from "@/lib/datetime/formatRomeInstant";
import { PresenzeReportPdf } from "@/lib/pdf/templates/PresenzeReportPdf";
import { renderPdfToBuffer } from "@/lib/pdf/renderPdf";
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

  try {
    const rows =
      resolved.querySalonIds !== null && resolved.querySalonIds.length === 0
        ? []
        : await loadAttendanceDailySummary({
            querySalonIds: resolved.querySalonIds,
            salonId: resolved.salonId,
            staffId: resolved.staffId,
            dateFrom: resolved.dateRange.dateFrom,
            dateTo: resolved.dateRange.dateTo,
          });

    const salonLabelText =
      resolved.salonId != null ? salonLabel(resolved.salonId) : "Tutti i saloni";
    const generatedAt = formatRomeDateTime(new Date().toISOString());
    const buffer = await renderPdfToBuffer(
      <PresenzeReportPdf
        salonLabelText={salonLabelText}
        dateFrom={resolved.dateRange.dateFrom}
        dateTo={resolved.dateRange.dateTo}
        generatedAt={generatedAt === "—" ? new Date().toISOString() : generatedAt}
        rows={rows}
      />,
    );

    const salonPart =
      resolved.salonId != null
        ? salonLabel(resolved.salonId).replace(/\s+/g, "-").toLowerCase()
        : "tutti-saloni";
    const filename = `presenze-${salonPart}-${resolved.dateRange.dateFrom}_${resolved.dateRange.dateTo}.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("attendance export pdf error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
