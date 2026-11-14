import "server-only";

import {
  buildAttendanceDailySummary,
  timestamptzBoundsForRomeDateRange,
  type AttendanceDailySummaryRow,
  type AttendanceLogEvent,
} from "@/lib/attendance/attendanceDailySummary";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function loadAttendanceDailySummary(params: {
  querySalonIds: number[] | null;
  salonId: number | null;
  staffId: number | null;
  dateFrom: string;
  dateTo: string;
}): Promise<AttendanceDailySummaryRow[]> {
  const { gteIso, ltIso } = timestamptzBoundsForRomeDateRange(
    params.dateFrom,
    params.dateTo,
  );

  let q = supabaseAdmin
    .from("attendance_logs")
    .select("staff_id,salon_id,type,created_at")
    .gte("created_at", gteIso)
    .lt("created_at", ltIso)
    .order("created_at", { ascending: true });

  if (params.querySalonIds !== null) {
    if (params.querySalonIds.length === 0) return [];
    q = q.in("salon_id", params.querySalonIds);
  }
  if (params.staffId != null && params.staffId > 0) {
    q = q.eq("staff_id", params.staffId);
  }

  const { data: logs, error: logsError } = await q;
  if (logsError) throw logsError;

  const events = (logs ?? []) as AttendanceLogEvent[];
  const staffIds = new Set(events.map((e) => e.staff_id));
  const staffNameById = new Map<number, string | null>();

  if (staffIds.size > 0) {
    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id,name")
      .in("id", Array.from(staffIds));
    if (staffError) throw staffError;
    for (const staff of staffRows ?? []) {
      const id = Number((staff as { id: unknown }).id);
      const name = (staff as { name: string | null }).name ?? null;
      if (Number.isInteger(id) && id > 0) staffNameById.set(id, name);
    }
  }

  return buildAttendanceDailySummary({
    events,
    staffNameById,
    filters: {
      salonId: params.salonId,
      staffId: params.staffId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    },
  });
}
