// lib/reports/getWhatsAppReminderLog.ts
import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeReminderStatusForDisplay } from "@/lib/whatsapp/appointmentReminderStatuses";

export type WhatsAppReminderLogFilters = {
  salonId: number;
  dateFrom: string;
  dateTo: string;
};

export type WhatsAppReminderLogRow = {
  id: number;
  status: string;
  delivery_status: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  error_message: string | null;
  delivery_error: string | null;
  template_name: string | null;
  phone: string | null;
  salon_name: string;
  customer_name: string;
  appointment_starts_at: string | null;
};

export type WhatsAppReminderLogTotals = {
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  delivered: number;
  read: number;
  delivery_failed: number;
};

function isoStart(d: string) {
  return `${d}T00:00:00`;
}
function isoEnd(d: string) {
  return `${d}T23:59:59.999`;
}

type RawReminder = {
  id: number;
  status: string;
  delivery_status: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  error_message: string | null;
  delivery_error: string | null;
  template_name: string | null;
  phone: string | null;
  appointments:
    | { start_time: string }
    | { start_time: string }[]
    | null;
  customers:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
  salons: { name: string | null } | { name: string | null }[] | null;
};

function single<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

async function countForStatuses(
  salonId: number,
  dateFrom: string,
  dateTo: string,
  statuses: string[],
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("appointment_whatsapp_reminders")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salonId)
    .in("status", statuses)
    .gte("scheduled_for", isoStart(dateFrom))
    .lte("scheduled_for", isoEnd(dateTo));
  if (error) return 0;
  return count ?? 0;
}

async function countForDeliveryStatuses(
  salonId: number,
  dateFrom: string,
  dateTo: string,
  statuses: string[],
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("appointment_whatsapp_reminders")
    .select("*", { count: "exact", head: true })
    .eq("salon_id", salonId)
    .in("delivery_status", statuses)
    .gte("scheduled_for", isoStart(dateFrom))
    .lte("scheduled_for", isoEnd(dateTo));
  if (error) return 0;
  return count ?? 0;
}

export async function getWhatsAppReminderLog(
  filters: WhatsAppReminderLogFilters,
): Promise<{ rows: WhatsAppReminderLogRow[]; totals: WhatsAppReminderLogTotals }> {
  const { salonId, dateFrom, dateTo } = filters;

  const emptyTotals: WhatsAppReminderLogTotals = {
    sent: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    delivered: 0,
    read: 0,
    delivery_failed: 0,
  };

  const [sent, failed, skipped, pending, delivered, read, deliveryFailed, listRes] =
    await Promise.all([
      countForStatuses(salonId, dateFrom, dateTo, ["sent"]),
      countForStatuses(salonId, dateFrom, dateTo, ["failed", "error"]),
      countForStatuses(salonId, dateFrom, dateTo, ["skipped"]),
      countForStatuses(salonId, dateFrom, dateTo, ["pending", "processing"]),
      countForDeliveryStatuses(salonId, dateFrom, dateTo, ["delivered"]),
      countForDeliveryStatuses(salonId, dateFrom, dateTo, ["read"]),
      countForDeliveryStatuses(salonId, dateFrom, dateTo, ["failed"]),
      supabaseAdmin
        .from("appointment_whatsapp_reminders")
        .select(
          "id, status, delivery_status, scheduled_for, sent_at, error_message, delivery_error, template_name, phone, appointments(start_time), customers(first_name, last_name), salons(name)",
        )
        .eq("salon_id", salonId)
        .gte("scheduled_for", isoStart(dateFrom))
        .lte("scheduled_for", isoEnd(dateTo))
        .order("created_at", { ascending: false })
        .limit(400),
    ]);

  const totals: WhatsAppReminderLogTotals = {
    sent,
    failed,
    skipped,
    pending,
    delivered,
    read,
    delivery_failed: deliveryFailed,
  };

  if (listRes.error) {
    console.error("[getWhatsAppReminderLog]", listRes.error);
    return { rows: [], totals: emptyTotals };
  }

  const rawList = (listRes.data ?? []) as unknown as RawReminder[];

  const rows: WhatsAppReminderLogRow[] = rawList.map((r) => {
    const appt = single(r.appointments);
    const cust = single(r.customers);
    const salon = single(r.salons);
    const fn = String(cust?.first_name ?? "").trim();
    const ln = String(cust?.last_name ?? "").trim();
    const customer_name = [fn, ln].filter(Boolean).join(" ") || "—";
    return {
      id: Number(r.id),
      status: normalizeReminderStatusForDisplay(String(r.status ?? "")),
      delivery_status: r.delivery_status ? String(r.delivery_status) : null,
      scheduled_for: r.scheduled_for,
      sent_at: r.sent_at,
      error_message: r.error_message,
      delivery_error: r.delivery_error,
      template_name: r.template_name,
      phone: r.phone,
      salon_name: String(salon?.name ?? "—"),
      customer_name,
      appointment_starts_at: appt?.start_time ?? null,
    };
  });

  return { rows, totals };
}
