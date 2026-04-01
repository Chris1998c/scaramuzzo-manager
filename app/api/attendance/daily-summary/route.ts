import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  requireAttendanceWebAccess,
  salonIdsForAttendanceFilter,
} from "@/lib/attendanceWebAccess";

type AttendanceEvent = {
  staff_id: number;
  salon_id: number;
  event_type: string;
  created_at: string;
};

type StaffRow = {
  id: number;
  name: string | null;
};

type SummaryAccumulator = {
  staff_id: number;
  salon_id: number;
  day: string;
  first_clock_in_at: string | null;
  last_clock_out_at: string | null;
  worked_minutes: number;
  is_incomplete: boolean;
  openClockInAt: Date | null;
};

function getDayKey(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

export async function GET() {
  const gate = await requireAttendanceWebAccess();
  if (!gate.ok) return gate.response;

  const salonIds = salonIdsForAttendanceFilter(gate.access);
  if (salonIds !== null && salonIds.length === 0) {
    return NextResponse.json({ success: true, rows: [] });
  }

  try {
    let q = supabaseAdmin
      .from("staff_attendance_logs")
      .select("staff_id,salon_id,event_type,created_at")
      .order("created_at", { ascending: true });

    if (salonIds !== null) {
      q = q.in("salon_id", salonIds);
    }

    const { data: logs, error: logsError } = await q;

    if (logsError) {
      throw logsError;
    }

    const events = (logs ?? []) as AttendanceEvent[];
    const summaryByKey = new Map<string, SummaryAccumulator>();
    const staffIds = new Set<number>();

    for (const event of events) {
      staffIds.add(event.staff_id);

      const day = getDayKey(event.created_at);
      const key = `${event.staff_id}:${day}`;
      const createdAtDate = new Date(event.created_at);

      if (Number.isNaN(createdAtDate.getTime())) {
        continue;
      }

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

      if (event.event_type === "clock_in") {
        if (summary.first_clock_in_at === null) {
          summary.first_clock_in_at = event.created_at;
        }

        if (summary.openClockInAt !== null) {
          // Back-to-back clock-in means sequence is inconsistent.
          summary.is_incomplete = true;
        }

        summary.openClockInAt = createdAtDate;
        continue;
      }

      if (event.event_type === "clock_out") {
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

    const staffNameById = new Map<number, string | null>();
    if (staffIds.size > 0) {
      const { data: staffRows, error: staffError } = await supabaseAdmin
        .from("staff")
        .select("id,name")
        .in("id", Array.from(staffIds));

      if (staffError) {
        throw staffError;
      }

      for (const staff of (staffRows ?? []) as StaffRow[]) {
        staffNameById.set(staff.id, staff.name);
      }
    }

    const rows = Array.from(summaryByKey.values())
      .map((summary) => ({
        staff_id: summary.staff_id,
        staff_name: staffNameById.get(summary.staff_id) ?? null,
        salon_id: summary.salon_id,
        day: summary.day,
        first_clock_in_at: summary.first_clock_in_at,
        last_clock_out_at: summary.last_clock_out_at,
        worked_minutes: summary.worked_minutes,
        is_incomplete: summary.is_incomplete,
      }))
      .sort((a, b) => {
        if (a.day !== b.day) {
          return b.day.localeCompare(a.day);
        }

        const nameA = (a.staff_name ?? "").toLocaleLowerCase();
        const nameB = (b.staff_name ?? "").toLocaleLowerCase();
        return nameA.localeCompare(nameB);
      });

    return NextResponse.json({ success: true, rows });
  } catch (error) {
    console.error("attendance daily-summary route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
