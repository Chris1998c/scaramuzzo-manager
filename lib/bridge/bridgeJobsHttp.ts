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
  return handler(authResult.auth);
}

export function bridgeJobError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}
