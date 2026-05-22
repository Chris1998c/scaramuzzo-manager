import { NextResponse } from "next/server";

import { isBridgeAuthResult, requireBridgeAuth } from "@/lib/bridge/auth";

export async function withBridgeAuth(
  req: Request,
  handler: (auth: import("@/lib/bridge/auth").BridgeTokenAuth) => Promise<NextResponse>,
): Promise<NextResponse> {
  const authResult = await requireBridgeAuth(req);
  if (!isBridgeAuthResult(authResult)) {
    return authResult;
  }
  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }
  try {
    return await handler(authResult.auth);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[bridge] jobs handler uncaught", { message: msg, stack });
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: msg },
      { status: 500 },
    );
  }
}

export function bridgeJobError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}
