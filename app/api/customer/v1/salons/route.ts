import { NextResponse } from "next/server";

import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import { fetchBookableSalons } from "@/lib/customer-app/fetchBookableSalons";
import {
  customerContextErrorResponse,
  customerServerError,
} from "@/lib/customer-app/customerApiResponse";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireCustomerContext(req);
    const salons = await fetchBookableSalons(ctx.supabase);
    return NextResponse.json({ salons });
  } catch (e) {
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/salons", e);
  }
}
