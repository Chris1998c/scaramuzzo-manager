import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  requireAttendanceWebAccess,
  salonIdsForAttendanceFilter,
} from "@/lib/attendanceWebAccess";

type AttendanceLogRow = {
  id: number;
  staff_id: number;
  salon_id: number;
  event_type: string;
  created_at: string;
  lat: number | null;
  lng: number | null;
};

type StaffNameRow = {
  id: number;
  name: string | null;
};

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
      .select("id,staff_id,salon_id,event_type,created_at,lat,lng")
      .order("created_at", { ascending: false })
      .limit(100);

    if (salonIds !== null) {
      q = q.in("salon_id", salonIds);
    }

    const { data: logs, error: logsError } = await q;

    if (logsError) {
      throw logsError;
    }

    const rows = (logs ?? []) as AttendanceLogRow[];
    const staffIds = Array.from(new Set(rows.map((row) => row.staff_id)));

    let staffNameById = new Map<number, string | null>();

    if (staffIds.length > 0) {
      const { data: staffRows, error: staffError } = await supabaseAdmin
        .from("staff")
        .select("id,name")
        .in("id", staffIds);

      if (staffError) {
        throw staffError;
      }

      staffNameById = new Map(
        ((staffRows ?? []) as StaffNameRow[]).map((staff) => [staff.id, staff.name])
      );
    }

    const enrichedRows = rows.map((row) => ({
      id: row.id,
      staff_id: row.staff_id,
      salon_id: row.salon_id,
      event_type: row.event_type,
      created_at: row.created_at,
      lat: row.lat,
      lng: row.lng,
      staff_name: staffNameById.get(row.staff_id) ?? null,
    }));

    return NextResponse.json({ success: true, rows: enrichedRows });
  } catch (error) {
    console.error("attendance list route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
