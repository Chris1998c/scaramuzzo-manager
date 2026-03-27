import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type MobileLoginBody = {
  code?: string;
  pin?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MobileLoginBody;
    const code = String(body.code ?? "").trim();
    const pin = String(body.pin ?? "");

    if (!code || !pin) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id,salon_id,mobile_enabled,mobile_pin_hash")
      .eq("staff_code", code)
      .maybeSingle();

    if (staffError) {
      throw staffError;
    }

    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!staff.mobile_enabled) {
      return NextResponse.json({ error: "Mobile access disabled" }, { status: 403 });
    }

    if (!staff.mobile_pin_hash) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isValidPin = await bcrypt.compare(pin, staff.mobile_pin_hash);
    if (!isValidPin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("staff")
      .update({ mobile_last_login_at: new Date().toISOString() })
      .eq("id", staff.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      staff_id: staff.id,
      salon_id: staff.salon_id,
    });
  } catch (error) {
    console.error("mobile login route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
