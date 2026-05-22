import { NextResponse } from "next/server";

import { authenticateBridgeBearer, applyBridgeHeartbeat } from "@/lib/bridge/bridgeDb";
import { parseBearerToken } from "@/lib/bridge/bridgeToken";
import {
  processBridgeHeartbeatSuccess,
} from "@/lib/bridge/processBridgeHeartbeat";
import type { BridgeHeartbeatInput } from "@/lib/bridge/sanitizeBridgeHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const plain = parseBearerToken(req.headers.get("authorization"));
  if (!plain) {
    return NextResponse.json({ ok: false, error: "missing_bearer_token" }, { status: 401 });
  }

  let body: BridgeHeartbeatInput;
  try {
    body = (await req.json()) as BridgeHeartbeatInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const auth = await authenticateBridgeBearer(plain);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const processed = processBridgeHeartbeatSuccess(auth.auth.installation, body);
  if (!processed.ok) {
    return NextResponse.json(
      { ok: false, error: processed.error },
      { status: processed.status },
    );
  }

  const applied = await applyBridgeHeartbeat(auth.auth.installation, body);
  if (!applied.ok) {
    return NextResponse.json({ ok: false, error: applied.error }, { status: applied.status });
  }

  return NextResponse.json({
    ok: true,
    received_at: new Date().toISOString(),
    status: processed.status,
    installation_id: processed.installation_id,
    flags: processed.flags,
  });
}
