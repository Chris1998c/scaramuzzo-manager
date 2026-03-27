import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AttendanceStatusBody = {
  staff_id?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AttendanceStatusBody;
    const staffId = Number(body.staff_id);

    if (!Number.isInteger(staffId) || staffId <= 0) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { data: latestLog, error: latestLogError } = await supabaseAdmin
      .from("staff_attendance_logs")
      .select("event_type")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestLogError) {
      throw latestLogError;
    }

    const status = latestLog?.event_type === "clock_in" ? "in" : "out";

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("mobile attendance status route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
