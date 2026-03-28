// Lettura presenze (attendance_logs): Bearer + compat body (lib/mobileSession).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveMobileStaffId } from "@/lib/mobileSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogRow = {
  id: number;
  staff_id: number;
  salon_id: number;
  type: "in" | "out";
  created_at: string;
};

type Body = {
  staff_id?: number;
};

function romeYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isoToRomeYmd(iso: string): string {
  return romeYmd(new Date(iso));
}

function workedMinutesFromPairs(sortedAsc: LogRow[]): number {
  let pendingIn: number | null = null;
  let totalMs = 0;
  for (const row of sortedAsc) {
    const t = new Date(row.created_at).getTime();
    if (row.type === "in") {
      pendingIn = t;
    } else if (row.type === "out") {
      if (pendingIn != null && t >= pendingIn) {
        totalMs += t - pendingIn;
        pendingIn = null;
      }
    }
  }
  return Math.floor(totalMs / 60_000);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const idRes = resolveMobileStaffId(req, body);
    if (!idRes.ok) return idRes.response;

    const staffId = idRes.staffId;

    const { data: staffRow, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, mobile_enabled")
      .eq("id", staffId)
      .maybeSingle();

    if (staffErr) {
      console.error("mobile attendance read staff:", staffErr.message);
      return NextResponse.json({ error: "Failed to verify staff" }, { status: 500 });
    }
    if (!staffRow) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    if (!staffRow.mobile_enabled) {
      return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
    }

    const { data: rawLogs, error: logsErr } = await supabaseAdmin
      .from("attendance_logs")
      .select("id, staff_id, salon_id, type, created_at")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (logsErr) {
      console.error("mobile attendance read logs:", logsErr.message);
      return NextResponse.json({ error: "Failed to load attendance logs" }, { status: 500 });
    }

    const logs = (rawLogs ?? []) as LogRow[];
    const todayRome = romeYmd(new Date());
    const todayLogs = logs.filter((l) => isoToRomeYmd(l.created_at) === todayRome);
    const todayAsc = [...todayLogs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const insToday = todayAsc.filter((l) => l.type === "in");
    const outsToday = todayAsc.filter((l) => l.type === "out");

    const first_in =
      insToday.length > 0 ? insToday[0].created_at : null;
    const last_out =
      outsToday.length > 0 ? outsToday[outsToday.length - 1].created_at : null;

    const worked_minutes = workedMinutesFromPairs(todayAsc);

    const latest = logs[0] ?? null;
    const status: "in" | "out" = latest?.type === "in" ? "in" : "out";

    const last_action = latest
      ? { type: latest.type, timestamp: latest.created_at }
      : null;

    const history = logs.slice(0, 20).map((l) => ({
      id: l.id,
      staff_id: l.staff_id,
      salon_id: l.salon_id,
      type: l.type,
      created_at: l.created_at,
    }));

    return NextResponse.json({
      success: true,
      status,
      last_action,
      today: {
        first_in,
        last_out,
        worked_minutes,
      },
      history,
    });
  } catch (error) {
    console.error("mobile attendance route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
