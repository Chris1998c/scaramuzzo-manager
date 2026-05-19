import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import { canAccessFiscalJobsWeb } from "@/lib/fiscalJobsWebAccessShared";
import { probePrintBridgeHealth } from "@/lib/fiscal/probePrintBridgeHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Health bridge per dashboard fiscale (read-only, non bloccante). */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const access = await getUserAccess();
  if (!canAccessFiscalJobsWeb(access.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const bridge = await probePrintBridgeHealth();
  return NextResponse.json({ success: true, bridge });
}
