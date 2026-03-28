// Origine token mobile: unico endpoint che autentica con code+PIN; emette Bearer se MOBILE_JWT_SECRET è configurato.
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MOBILE_TOKEN_TTL_SEC, signMobileToken } from "@/lib/mobileSession";

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
      .select("id,name,salon_id,mobile_enabled,mobile_pin_hash")
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

    let access_token: string | undefined;
    let token_type: string | undefined;
    let expires_in: number | undefined;
    if (process.env.MOBILE_JWT_SECRET?.trim()) {
      try {
        access_token = signMobileToken({
          sid: staff.id as number,
          salon_id: staff.salon_id as number,
        });
        token_type = "Bearer";
        expires_in = MOBILE_TOKEN_TTL_SEC;
      } catch (e) {
        console.error("mobile login token sign failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      staff_id: staff.id,
      salon_id: staff.salon_id,
      collaborator_name: String(staff.name ?? "").trim() || null,
      ...(access_token != null
        ? { access_token, token_type, expires_in }
        : {}),
    });
  } catch (error) {
    console.error("mobile login route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
