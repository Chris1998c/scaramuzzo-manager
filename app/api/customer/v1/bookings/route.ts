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
import {
  beginCustomerBookingIdempotency,
  completeCustomerBookingIdempotency,
  hashCustomerBookingPayload,
  parseCustomerBookingIdempotencyKey,
  releaseCustomerBookingIdempotency,
} from "@/lib/customer-app/customerBookingIdempotency";
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

    const idempotencyParsed = parseCustomerBookingIdempotencyKey(
      req.headers.get("Idempotency-Key"),
    );
    if (!idempotencyParsed.ok) {
      return customerBadRequest(idempotencyParsed.error);
    }

    const requestHash = hashCustomerBookingPayload(parsed.data);
    const idempotencyBegin = await beginCustomerBookingIdempotency(supabaseAdmin, {
      userId: ctx.authUserId,
      customerId: ctx.customerId,
      idempotencyKey: idempotencyParsed.key,
      requestHash,
    });

    if (idempotencyBegin.action === "replay") {
      return NextResponse.json({ booking: idempotencyBegin.booking }, { status: 201 });
    }
    if (idempotencyBegin.action === "conflict") {
      return customerConflictResponse(idempotencyBegin.message);
    }

    const idempotencyRecordId = idempotencyBegin.recordId;

    try {
      const booking = await createCustomerAppBooking(
        supabaseAdmin,
        ctx.customerId,
        parsed.data,
      );

      if (idempotencyRecordId) {
        await completeCustomerBookingIdempotency(
          supabaseAdmin,
          idempotencyRecordId,
          booking,
        );
      }

      return NextResponse.json({ booking }, { status: 201 });
    } catch (bookingErr) {
      if (idempotencyRecordId) {
        try {
          await releaseCustomerBookingIdempotency(supabaseAdmin, idempotencyRecordId);
        } catch {
          /* release best-effort */
        }
      }
      throw bookingErr;
    }
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
