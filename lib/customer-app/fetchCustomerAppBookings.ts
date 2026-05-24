import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeLineEndTime } from "@/lib/agenda/assertStaffSlotFree";
import type { ParsedCustomerAppBookingsQuery } from "@/lib/customer-app/parseCustomerAppBookingsQuery";

export type CustomerAppBookingListServiceDto = {
  service_id: number;
  service_name: string;
  staff_id: number | null;
  staff_name: string | null;
  start_time: string;
  end_time: string;
  duration: number;
  price: number;
  vat_rate: number;
};

export type CustomerAppBookingListDto = {
  id: number;
  salon_id: number;
  salon_name: string;
  start_time: string;
  end_time: string;
  status: string;
  source: string;
  notes: string | null;
  services: CustomerAppBookingListServiceDto[];
};

const BOOKINGS_SELECT = `
  id,
  salon_id,
  start_time,
  end_time,
  status,
  source,
  notes,
  salons:salon_id ( name ),
  appointment_services (
    service_id,
    staff_id,
    start_time,
    duration_minutes,
    price,
    vat_rate,
    services:service_id ( name ),
    staff:staff_id ( name )
  )
`;

type NameJoinRow = { name?: unknown } | { name?: unknown }[] | null;

type AppointmentServiceRow = {
  service_id?: unknown;
  staff_id?: unknown;
  start_time?: unknown;
  duration_minutes?: unknown;
  price?: unknown;
  vat_rate?: unknown;
  services?: NameJoinRow;
  staff?: NameJoinRow;
};

type AppointmentRow = {
  id?: unknown;
  salon_id?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  status?: unknown;
  source?: unknown;
  notes?: unknown;
  salons?: NameJoinRow;
  appointment_services?: AppointmentServiceRow[] | null;
};

function unwrapName(row: NameJoinRow | undefined): string | null {
  if (!row) return null;
  const obj = Array.isArray(row) ? row[0] : row;
  if (!obj || typeof obj !== "object") return null;
  const name = (obj as { name?: unknown }).name;
  return name != null ? String(name) : null;
}

function mapServiceRow(row: AppointmentServiceRow): CustomerAppBookingListServiceDto {
  const startTime = String(row.start_time ?? "");
  const duration = Number(row.duration_minutes ?? 0);
  return {
    service_id: Number(row.service_id),
    service_name: unwrapName(row.services) ?? "",
    staff_id: row.staff_id != null ? Number(row.staff_id) : null,
    staff_name: unwrapName(row.staff),
    start_time: startTime,
    end_time: computeLineEndTime(startTime, duration),
    duration,
    price: Number(row.price),
    vat_rate: Number(row.vat_rate),
  };
}

function mapAppointmentRow(row: AppointmentRow): CustomerAppBookingListDto {
  const services = (row.appointment_services ?? [])
    .map(mapServiceRow)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return {
    id: Number(row.id),
    salon_id: Number(row.salon_id),
    salon_name: unwrapName(row.salons) ?? "",
    start_time: String(row.start_time ?? ""),
    end_time: String(row.end_time ?? ""),
    status: String(row.status ?? "scheduled"),
    source: String(row.source ?? "booking"),
    notes: row.notes != null ? String(row.notes) : null,
    services,
  };
}

/**
 * Elenco appuntamenti del cliente autenticato.
 * Ordine: start_time DESC (appuntamenti più recenti / futuri lontani per primi).
 */
export async function fetchCustomerAppBookings(
  admin: SupabaseClient,
  customerId: string,
  query: ParsedCustomerAppBookingsQuery,
): Promise<CustomerAppBookingListDto[]> {
  let q = admin
    .from("appointments")
    .select(BOOKINGS_SELECT)
    .eq("customer_id", customerId);

  if (query.salonId != null) {
    q = q.eq("salon_id", query.salonId);
  }
  if (query.status != null) {
    q = q.eq("status", query.status);
  }
  if (query.from) {
    q = q.gte("start_time", `${query.from}T00:00:00`);
  }
  if (query.to) {
    q = q.lte("start_time", `${query.to}T23:59:59`);
  }

  const { data, error } = await q
    .order("start_time", { ascending: false })
    .order("start_time", {
      foreignTable: "appointment_services",
      ascending: true,
    })
    .limit(query.limit);

  if (error) {
    throw new Error(`fetchCustomerAppBookings: ${error.message}`);
  }

  return (data ?? []).map((row) => mapAppointmentRow(row as AppointmentRow));
}
