import { NextResponse } from "next/server";

import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import {
  customerBadRequest,
  customerContextErrorResponse,
  customerServerError,
} from "@/lib/customer-app/customerApiResponse";
import { fetchCustomerAppServices } from "@/lib/customer-app/fetchCustomerAppServices";
import {
  parseCustomerAppSalonId,
  salonIdInvalidMessage,
} from "@/lib/customer-app/salonValidation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireCustomerContext();

    const url = new URL(req.url);
    const salonId = parseCustomerAppSalonId(url.searchParams.get("salon_id"));

    if (salonId === null) {
      return customerBadRequest(salonIdInvalidMessage());
    }

    const services = await fetchCustomerAppServices(supabaseAdmin, salonId);
    return NextResponse.json({ services });
  } catch (e) {
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/services", e);
  }
}
