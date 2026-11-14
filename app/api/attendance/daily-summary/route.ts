import { NextResponse } from "next/server";
import { loadAttendanceDailySummary } from "@/lib/attendance/loadAttendanceDailySummary";
import { resolveAttendanceQuery } from "@/lib/attendance/resolveAttendanceQuery";
import { todayRomeBusinessDate } from "@/lib/attendance/attendanceDailySummary";
import {
  requireAttendanceWebAccess,
} from "@/lib/attendanceWebAccess";

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

  if (resolved.querySalonIds !== null && resolved.querySalonIds.length === 0) {
    return NextResponse.json({ success: true, rows: [] });
  }

  try {
    const rows = await loadAttendanceDailySummary({
      querySalonIds: resolved.querySalonIds,
      salonId: resolved.salonId,
      staffId: resolved.staffId,
      dateFrom: resolved.dateRange.dateFrom,
      dateTo: resolved.dateRange.dateTo,
    });

    return NextResponse.json({
      success: true,
      rows,
      meta: {
        salon_id: resolved.salonId,
        staff_id: resolved.staffId,
        date_from: resolved.dateRange.dateFrom,
        date_to: resolved.dateRange.dateTo,
      },
    });
  } catch (error) {
    console.error("attendance daily-summary route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
