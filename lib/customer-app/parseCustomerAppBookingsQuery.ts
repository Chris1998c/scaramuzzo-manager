import {
  DEFAULT_CUSTOMER_APP_BOOKINGS_LIMIT,
  MAX_CUSTOMER_APP_BOOKINGS_LIMIT,
} from "@/lib/customer-app/customerAppLimits";
import { parseCustomerAppIsoDate } from "@/lib/customer-app/customerAppQuery";
import { parseCustomerAppSalonId, salonIdInvalidMessage } from "@/lib/customer-app/salonValidation";

/** Stati appuntamento esposti in filtro GET /bookings (allineati ad agenda). */
export const CUSTOMER_APP_BOOKING_STATUSES = [
  "scheduled",
  "in_sala",
  "done",
  "cancelled",
  "no_show",
  "noshow",
] as const;

export type CustomerAppBookingStatusFilter = (typeof CUSTOMER_APP_BOOKING_STATUSES)[number];

const STATUS_SET = new Set<string>(CUSTOMER_APP_BOOKING_STATUSES);

export type ParsedCustomerAppBookingsQuery = {
  salonId: number | null;
  status: CustomerAppBookingStatusFilter | null;
  from: string | null;
  to: string | null;
  limit: number;
};

export type ParseCustomerAppBookingsQueryResult =
  | { ok: true; data: ParsedCustomerAppBookingsQuery }
  | { ok: false; error: string };

function parseLimit(raw: unknown): { ok: true; limit: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, limit: DEFAULT_CUSTOMER_APP_BOOKINGS_LIMIT };
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, error: "limit non valido" };
  }
  if (n > MAX_CUSTOMER_APP_BOOKINGS_LIMIT) {
    return {
      ok: false,
      error: `limit: massimo ${MAX_CUSTOMER_APP_BOOKINGS_LIMIT}`,
    };
  }
  return { ok: true, limit: n };
}

function parseStatus(raw: unknown): { ok: true; status: CustomerAppBookingStatusFilter | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, status: null };
  }
  const s = String(raw).trim().toLowerCase();
  if (!STATUS_SET.has(s)) {
    return { ok: false, error: "status non valido" };
  }
  return { ok: true, status: s as CustomerAppBookingStatusFilter };
}

export function parseCustomerAppBookingsQuery(url: URL): ParseCustomerAppBookingsQueryResult {
  const salonRaw = url.searchParams.get("salon_id");
  let salonId: number | null = null;
  if (salonRaw !== null && salonRaw !== "") {
    salonId = parseCustomerAppSalonId(salonRaw);
    if (salonId === null) {
      return { ok: false, error: salonIdInvalidMessage() };
    }
  }

  const statusParsed = parseStatus(url.searchParams.get("status"));
  if (!statusParsed.ok) {
    return { ok: false, error: statusParsed.error };
  }

  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");

  let from: string | null = null;
  if (fromRaw !== null && fromRaw !== "") {
    from = parseCustomerAppIsoDate(fromRaw);
    if (!from) {
      return { ok: false, error: "from non valido (formato YYYY-MM-DD)" };
    }
  }

  let to: string | null = null;
  if (toRaw !== null && toRaw !== "") {
    to = parseCustomerAppIsoDate(toRaw);
    if (!to) {
      return { ok: false, error: "to non valido (formato YYYY-MM-DD)" };
    }
  }

  if (from && to && from > to) {
    return { ok: false, error: "from non può essere successivo a to" };
  }

  const limitParsed = parseLimit(url.searchParams.get("limit"));
  if (!limitParsed.ok) {
    return { ok: false, error: limitParsed.error };
  }

  return {
    ok: true,
    data: {
      salonId,
      status: statusParsed.status,
      from,
      to,
      limit: limitParsed.limit,
    },
  };
}
