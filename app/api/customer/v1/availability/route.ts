import { NextResponse } from "next/server";

import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import {
  customerBadRequest,
  customerContextErrorResponse,
  customerRateLimitedResponse,
  customerServerError,
} from "@/lib/customer-app/customerApiResponse";
import {
  computeCustomerAppAvailability,
  CustomerAppAvailabilityResolveError,
} from "@/lib/customer-app/computeCustomerAppAvailability";
import { enforceCustomerApiRateLimit } from "@/lib/customer-app/customerApiRateLimit";
import {
  isPastCustomerAppDate,
  parseCustomerAppIsoDate,
  parseCustomerAppServiceIds,
  parseOptionalPositiveInt,
} from "@/lib/customer-app/customerAppQuery";
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

    const rate = enforceCustomerApiRateLimit(req, ctx.authUserId, "availability");
    if (!rate.allowed) {
      return customerRateLimitedResponse(rate.retryAfterSec);
    }

    const url = new URL(req.url);
    const salonId = parseCustomerAppSalonId(url.searchParams.get("salon_id"));
    if (salonId === null) {
      return customerBadRequest(salonIdInvalidMessage());
    }

    const serviceIds = parseCustomerAppServiceIds(url);
    if (!serviceIds?.length) {
      return customerBadRequest("service_ids obbligatorio");
    }

    const isoDate = parseCustomerAppIsoDate(url.searchParams.get("date"));
    if (!isoDate) {
      return customerBadRequest("date non valida (formato YYYY-MM-DD)");
    }
    if (isPastCustomerAppDate(isoDate)) {
      return customerBadRequest("date non può essere nel passato");
    }

    const staffIdRaw = url.searchParams.get("staff_id");
    const staffId = staffIdRaw ? parseOptionalPositiveInt(staffIdRaw) : null;
    if (staffIdRaw && staffId === null) {
      return customerBadRequest("staff_id non valido");
    }

    const slots = await computeCustomerAppAvailability({
      admin: supabaseAdmin,
      salonId,
      isoDate,
      serviceIds,
      staffId,
    });

    return NextResponse.json({ slots });
  } catch (e) {
    if (e instanceof CustomerAppAvailabilityResolveError) {
      return customerBadRequest(e.message);
    }
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/availability", e);
  }
}
