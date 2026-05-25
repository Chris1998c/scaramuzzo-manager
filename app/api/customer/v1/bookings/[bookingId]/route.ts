import { NextResponse } from "next/server";

import { requireCustomerContext } from "@/app/api/customer/v1/_lib/requireCustomerContext";
import {
  customerBadRequest,
  customerConflictResponse,
  customerContextErrorResponse,
  customerForbidden,
  customerNotFoundResponse,
  customerRateLimitedResponse,
  customerServerError,
} from "@/lib/customer-app/customerApiResponse";
import { enforceCustomerApiRateLimit } from "@/lib/customer-app/customerApiRateLimit";
import {
  cancelCustomerAppBooking,
  CustomerAppBookingCancelConflictError,
  CustomerAppBookingCancelForbiddenError,
  CustomerAppBookingCancelNotFoundError,
} from "@/lib/customer-app/cancelCustomerAppBooking";
import { parseCustomerAppBookingId } from "@/lib/customer-app/parseCustomerAppBookingId";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ bookingId: string }> },
) {
  try {
    const customerCtx = await requireCustomerContext(req);

    const rate = enforceCustomerApiRateLimit(req, customerCtx.authUserId, "bookings_delete");
    if (!rate.allowed) {
      return customerRateLimitedResponse(rate.retryAfterSec);
    }

    const { bookingId: bookingIdRaw } = await ctx.params;
    const bookingId = parseCustomerAppBookingId(bookingIdRaw);
    if (bookingId === null) {
      return customerBadRequest("bookingId non valido");
    }

    const booking = await cancelCustomerAppBooking(
      supabaseAdmin,
      customerCtx.customerId,
      bookingId,
    );

    return NextResponse.json({ booking });
  } catch (e) {
    if (e instanceof CustomerAppBookingCancelNotFoundError) {
      return customerNotFoundResponse(e.message);
    }
    if (e instanceof CustomerAppBookingCancelForbiddenError) {
      return customerForbidden(e.message);
    }
    if (e instanceof CustomerAppBookingCancelConflictError) {
      return customerConflictResponse(e.message);
    }
    const authRes = customerContextErrorResponse(e);
    if (authRes) return authRes;
    return customerServerError("customer/v1/bookings/[bookingId] DELETE", e);
  }
}
