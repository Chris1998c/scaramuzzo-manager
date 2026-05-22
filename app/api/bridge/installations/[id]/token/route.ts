import { NextResponse } from "next/server";

import { mintBridgeTokenForInstallation } from "@/lib/bridge/bridgeDb";
import { canManageBridgeTokens } from "@/lib/bridge/bridgeWebAccess";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;

  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const access = await getUserAccess();
  if (!canManageBridgeTokens(access.role)) {
    return NextResponse.json(
      { error: "Solo coordinator può generare token bridge" },
      { status: 403 },
    );
  }

  const result = await mintBridgeTokenForInstallation(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    bridge_id: result.bridge_id,
    token: result.token,
    token_prefix: result.token_meta.token_prefix,
    token_id: result.token_meta.id,
    warning: "Copiare il token ora: non verrà più mostrato.",
  });
}
