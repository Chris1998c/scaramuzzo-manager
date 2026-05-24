import { NextResponse } from "next/server";

import {
  CustomerContextError,
  isCustomerContextError,
} from "@/app/api/customer/v1/_lib/requireCustomerContext";

export function customerContextErrorResponse(e: unknown): NextResponse | null {
  if (!isCustomerContextError(e)) return null;
  return NextResponse.json({ error: e.message }, { status: e.status });
}

export function customerBadRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function customerForbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function customerNotFoundResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function customerServerError(logLabel: string, e: unknown): NextResponse {
  console.error(`[${logLabel}]`, e);
  return NextResponse.json({ error: "Errore server" }, { status: 500 });
}

export function customerConflictResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function customerRateLimitedResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Troppe richieste. Riprova tra poco." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSec)) },
    },
  );
}

export { CustomerContextError };
