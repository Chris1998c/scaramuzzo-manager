// Stato in/out da attendance_logs (allineato a clock + GET presenze).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveMobileStaffId } from "@/lib/mobileSession";

type AttendanceStatusBody = {
  staff_id?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AttendanceStatusBody;
    const idRes = resolveMobileStaffId(req, body);
    if (!idRes.ok) return idRes.response;

    const staffId = idRes.staffId;

    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, mobile_enabled")
      .eq("id", staffId)
      .maybeSingle();

    if (staffErr) {
      console.error("mobile attendance status staff:", staffErr.message);
      return NextResponse.json({ error: "Failed to verify staff" }, { status: 500 });
    }
    if (!staffRow) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    if (!staffRow.mobile_enabled) {
      return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
    }

    const { data: latestLog, error: latestLogError } = await supabaseAdmin
      .from("attendance_logs")
      .select("type")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestLogError) {
      throw latestLogError;
    }

    const status = latestLog?.type === "in" ? "in" : "out";

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("mobile attendance status route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
