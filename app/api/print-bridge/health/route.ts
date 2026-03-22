import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkPrintBridgeReachable } from "@/lib/printBridgeHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRole = "reception" | "coordinator" | "magazzino";

function roleFromMetadata(user: {
  user_metadata?: unknown;
  app_metadata?: unknown;
}): string {
  return String(
    (user as { user_metadata?: { role?: string }; app_metadata?: { role?: string } })
      ?.user_metadata?.role ??
      (user as { app_metadata?: { role?: string } })?.app_metadata?.role ??
      "",
  ).trim();
}

async function getRoleFromDb(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const roleName = (data as { roles?: { name?: string } }).roles?.name;
  return roleName ? String(roleName).trim() : null;
}

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const dbRole = await getRoleFromDb(authData.user.id);
  const role = (dbRole || roleFromMetadata(authData.user)) as StaffRole;

  if (!["reception", "coordinator", "magazzino"].includes(role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const bridge = await checkPrintBridgeReachable();
  if (bridge.ok) {
    return NextResponse.json({ ok: true as const });
  }
  return NextResponse.json({
    ok: false as const,
    error: bridge.error,
  });
}
