import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { checkPrintBridgeReachable } from "@/lib/printBridgeHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const access = await getUserAccess();
  const role = access.role;

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
