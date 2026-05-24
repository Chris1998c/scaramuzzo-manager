import { NextResponse } from "next/server";

import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import {
  customerBadRequest,
  customerContextErrorResponse,
  customerRateLimitedResponse,
  customerServerError,
} from "@/lib/customer-app/customerApiResponse";
import { enforceCustomerApiRateLimit } from "@/lib/customer-app/customerApiRateLimit";
import { fetchCustomerAppStaff } from "@/lib/customer-app/fetchCustomerAppStaff";
import { parseOptionalPositiveInt } from "@/lib/customer-app/customerAppQuery";
import {
  parseCustomerAppSalonId,
  salonIdInvalidMessage,
} from "@/lib/customer-app/salonValidation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireCustomerContext();

    const rate = enforceCustomerApiRateLimit(req, ctx.authUserId, "staff");
    if (!rate.allowed) {
      return customerRateLimitedResponse(rate.retryAfterSec);
    }

    const url = new URL(req.url);
    const salonId = parseCustomerAppSalonId(url.searchParams.get("salon_id"));
    if (salonId === null) {
      return customerBadRequest(salonIdInvalidMessage());
    }

    const serviceIdRaw = url.searchParams.get("service_id");
    const serviceId = serviceIdRaw ? parseOptionalPositiveInt(serviceIdRaw) : null;
    if (serviceIdRaw && serviceId === null) {
      return customerBadRequest("service_id non valido");
    }

    const staff = await fetchCustomerAppStaff(supabaseAdmin, salonId, serviceId);
    return NextResponse.json({ staff });
  } catch (e) {
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/staff", e);
  }
}
