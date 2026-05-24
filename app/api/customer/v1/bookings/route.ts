import { NextResponse } from "next/server";

import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import {
  customerBadRequest,
  customerConflictResponse,
  customerContextErrorResponse,
  customerForbidden,
  customerRateLimitedResponse,
  customerServerError,
} from "@/lib/customer-app/customerApiResponse";
import { enforceCustomerApiRateLimit } from "@/lib/customer-app/customerApiRateLimit";
import {
  createCustomerAppBooking,
  CustomerAppBookingConflictError,
  CustomerAppBookingValidationError,
} from "@/lib/customer-app/createCustomerAppBooking";
import { fetchCustomerAppBookings } from "@/lib/customer-app/fetchCustomerAppBookings";
import { parseCustomerAppBookingBody } from "@/lib/customer-app/parseCustomerAppBookingBody";
import { parseCustomerAppBookingsQuery } from "@/lib/customer-app/parseCustomerAppBookingsQuery";
import { isStaffScheduleConflictError } from "@/lib/agenda/assertStaffSchedule";
import {
  isStaffSlotConflictOrDbError,
  STAFF_SLOT_CONFLICT_MESSAGE,
} from "@/lib/agenda/assertStaffSlotFree";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireCustomerContext();

    const parsed = parseCustomerAppBookingsQuery(new URL(req.url));
    if (!parsed.ok) {
      return customerBadRequest(parsed.error);
    }

    const bookings = await fetchCustomerAppBookings(
      supabaseAdmin,
      ctx.customerId,
      parsed.data,
    );

    return NextResponse.json({ bookings });
  } catch (e) {
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/bookings GET", e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCustomerContext();

    const rate = enforceCustomerApiRateLimit(req, ctx.authUserId, "bookings");
    if (!rate.allowed) {
      return customerRateLimitedResponse(rate.retryAfterSec);
    }

    const body = await req.json().catch(() => null);
    const parsed = parseCustomerAppBookingBody(body);
    if (!parsed.ok) {
      return customerBadRequest(parsed.error);
    }

    const booking = await createCustomerAppBooking(
      supabaseAdmin,
      ctx.customerId,
      parsed.data,
    );

    return NextResponse.json({ booking }, { status: 201 });
  } catch (e) {
    if (e instanceof CustomerAppBookingValidationError) {
      if (e.status === 403) {
        return customerForbidden(e.message);
      }
      return customerBadRequest(e.message);
    }
    if (e instanceof CustomerAppBookingConflictError) {
      return customerConflictResponse(e.message);
    }
    if (isStaffScheduleConflictError(e)) {
      return customerConflictResponse((e as Error).message);
    }
    if (isStaffSlotConflictOrDbError(e)) {
      return customerConflictResponse(STAFF_SLOT_CONFLICT_MESSAGE);
    }
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/bookings POST", e);
  }
}
