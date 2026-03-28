/**
 * DEPRECATED: POST /api/mobile/attendance/toggle — timbratura senza GPS (attendance_logs).
 * Sostituire con POST /api/mobile/attendance/clock. Da rimuovere in una release futura quando nessun client la chiama.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveMobileStaffId } from "@/lib/mobileSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  staff_id?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const idRes = resolveMobileStaffId(req, body);
    if (!idRes.ok) return idRes.response;

    const staffId = idRes.staffId;

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id, salon_id, mobile_enabled")
      .eq("id", staffId)
      .maybeSingle();

    if (staffError) {
      console.error("mobile attendance toggle staff:", staffError.message);
      return NextResponse.json({ error: "Failed to verify staff" }, { status: 500 });
    }
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    if (!staff.mobile_enabled) {
      return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
    }

    const { data: latestLog, error: latestErr } = await supabaseAdmin
      .from("attendance_logs")
      .select("type")
      .eq("staff_id", staff.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      console.error("mobile attendance toggle latest:", latestErr.message);
      return NextResponse.json({ error: "Failed to read attendance" }, { status: 500 });
    }

    const nextType: "in" | "out" = latestLog?.type === "in" ? "out" : "in";

    const { error: insertError } = await supabaseAdmin.from("attendance_logs").insert({
      staff_id: staff.id,
      salon_id: staff.salon_id,
      type: nextType,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("mobile attendance toggle insert:", insertError.message);
      return NextResponse.json({ error: "Failed to record attendance" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      new_status: nextType,
    });
  } catch (error) {
    console.error("mobile attendance toggle error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
