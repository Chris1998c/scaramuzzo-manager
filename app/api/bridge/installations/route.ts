import { NextResponse } from "next/server";

import {
  createBridgeInstallation,
  fetchBridgeInstallationsForDashboard,
  listBridgeTokensForInstallation,
} from "@/lib/bridge/bridgeDb";
import { buildBridgeDashboardRows } from "@/lib/bridge/buildBridgeDashboardRows";
import {
  canManageBridgeTokens,
  canViewBridgeDashboard,
  resolveBridgeSalonFilter,
} from "@/lib/bridge/bridgeWebAccess";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const access = await getUserAccess();
  if (!canViewBridgeDashboard(access.role)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const url = new URL(req.url);
  const querySalon = url.searchParams.get("salon_id");
  const querySalonNum = querySalon ? Number(querySalon) : null;
  const salonFilter = resolveBridgeSalonFilter(
    access,
    Number.isFinite(querySalonNum) ? Math.trunc(querySalonNum!) : null,
  );

  const rows = await fetchBridgeInstallationsForDashboard(salonFilter);
  const dashboard = buildBridgeDashboardRows(rows);

  return NextResponse.json({
    success: true,
    salon_filter: salonFilter,
    can_manage: canManageBridgeTokens(access.role),
    installations: dashboard,
  });
}

type CreateBody = {
  bridge_id?: string;
  salon_id?: number;
  name?: string;
};

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const access = await getUserAccess();
  if (!canManageBridgeTokens(access.role)) {
    return NextResponse.json(
      { error: "Solo coordinator può registrare bridge" },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bridge_id = String(body.bridge_id ?? "").trim();
  const salon_id = Number(body.salon_id);
  if (!bridge_id) {
    return NextResponse.json({ error: "bridge_id obbligatorio" }, { status: 400 });
  }
  if (!Number.isFinite(salon_id)) {
    return NextResponse.json({ error: "salon_id obbligatorio" }, { status: 400 });
  }

  const created = await createBridgeInstallation({
    bridge_id,
    salon_id: Math.trunc(salon_id),
    name: body.name,
  });

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const tokens = await listBridgeTokensForInstallation(created.installation.id);

  return NextResponse.json({
    success: true,
    installation: created.installation,
    tokens,
    message:
      "Installation creata. Generare token con POST /api/bridge/installations/[id]/token",
  });
}
