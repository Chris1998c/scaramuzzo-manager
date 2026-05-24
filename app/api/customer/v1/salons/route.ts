import { NextResponse } from "next/server";

import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import { fetchBookableSalons } from "@/lib/customer-app/fetchBookableSalons";
import {
  customerContextErrorResponse,
  customerServerError,
} from "@/lib/customer-app/customerApiResponse";
import { createServerSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCustomerContext();
    const supabase = await createServerSupabase();
    const salons = await fetchBookableSalons(supabase);
    return NextResponse.json({ salons });
  } catch (e) {
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/salons", e);
  }
}
