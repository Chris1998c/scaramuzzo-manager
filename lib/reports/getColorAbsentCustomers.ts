import { createServerSupabase } from "@/lib/supabaseServer";
import {
  COLOR_CARD_TYPES,
  evaluateColorAbsentCustomer,
  isColorAppointmentService,
  isColorCardType,
  isLighteningCardType,
  type ColorAbsentCustomer,
} from "@/lib/reports/colorAbsentSegment";

const LIST_LIMIT = 12;

function displayName(
  c: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | undefined,
  customerId: string,
): string {
  const fn = String(c?.first_name ?? "").trim();
  const ln = String(c?.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const phone = String(c?.phone ?? "").trim();
  if (phone) return phone;
  const email = String(c?.email ?? "").trim();
  if (email) return email;
  return `Cliente #${customerId}`;
}

type ServiceRef = {
  name?: string | null;
  service_categories?: { name?: string | null } | null;
};

function appointmentHasColorService(
  headerService: ServiceRef | null | undefined,
  lines: Array<{ services?: ServiceRef | null }> | null | undefined,
): boolean {
  if (
    headerService &&
    isColorAppointmentService(headerService.name, headerService.service_categories?.name)
  ) {
    return true;
  }
  for (const ln of lines ?? []) {
    const svc = ln.services;
    if (svc && isColorAppointmentService(svc.name, svc.service_categories?.name)) {
      return true;
    }
  }
  return false;
}

export async function getColorAbsentCustomers(salonId: number): Promise<ColorAbsentCustomer[]> {
  const supabase = await createServerSupabase();

  const { data: cards, error: cardsErr } = await supabase
    .from("customer_service_cards")
    .select("customer_id, service_type, created_at, salon_id")
    .in("service_type", [...COLOR_CARD_TYPES])
    .or(`salon_id.eq.${salonId},salon_id.is.null`);

  if (cardsErr) throw new Error(cardsErr.message);

  type CardAgg = {
    hasLightening: boolean;
    lastCardAt: string | null;
  };

  const cardByCustomer = new Map<string, CardAgg>();

  for (const row of cards ?? []) {
    const cid = String((row as { customer_id?: unknown }).customer_id ?? "");
    const st = String((row as { service_type?: unknown }).service_type ?? "");
    if (!cid || !isColorCardType(st)) continue;

    const created = String((row as { created_at?: unknown }).created_at ?? "");
    const agg = cardByCustomer.get(cid) ?? { hasLightening: false, lastCardAt: null };
    if (isLighteningCardType(st)) agg.hasLightening = true;
    if (created && (!agg.lastCardAt || created > agg.lastCardAt)) {
      agg.lastCardAt = created;
    }
    cardByCustomer.set(cid, agg);
  }

  const customerIds = [...cardByCustomer.keys()];
  if (!customerIds.length) return [];

  const customersMap = new Map<
    string,
    {
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
      email?: string | null;
    }
  >();

  const chunkSize = 200;
  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize);
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .in("id", chunk);
    if (custErr) throw new Error(custErr.message);
    for (const c of customers ?? []) {
      customersMap.set(String((c as { id?: unknown }).id), c as {
        first_name?: string | null;
        last_name?: string | null;
        phone?: string | null;
        email?: string | null;
      });
    }
  }

  const lastColorAppt = new Map<string, string>();

  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize);
    const { data: appts, error: apptErr } = await supabase
      .from("appointments")
      .select(
        `
        customer_id,
        start_time,
        services ( name, service_categories ( name ) ),
        appointment_services (
          services ( name, service_categories ( name ) )
        )
      `,
      )
      .eq("salon_id", salonId)
      .in("customer_id", chunk);

    if (apptErr) throw new Error(apptErr.message);

    for (const a of appts ?? []) {
      const cid = String((a as { customer_id?: unknown }).customer_id ?? "");
      const start = String((a as { start_time?: unknown }).start_time ?? "");
      if (!cid || !start) continue;

      const header = (a as { services?: ServiceRef | null }).services;
      const lines = (a as { appointment_services?: Array<{ services?: ServiceRef | null }> })
        .appointment_services;

      if (!appointmentHasColorService(header, lines)) continue;

      const prev = lastColorAppt.get(cid);
      if (!prev || start > prev) lastColorAppt.set(cid, start);
    }
  }

  const results: ColorAbsentCustomer[] = [];

  for (const [cid, cardAgg] of cardByCustomer.entries()) {
    const evaluated = evaluateColorAbsentCustomer({
      customerId: cid,
      customerName: displayName(customersMap.get(cid), cid),
      phone: customersMap.get(cid)?.phone ? String(customersMap.get(cid)!.phone).trim() : null,
      hasLighteningHistory: cardAgg.hasLightening,
      lastCardAt: cardAgg.lastCardAt,
      lastColorAppointmentAt: lastColorAppt.get(cid) ?? null,
    });
    if (evaluated) results.push(evaluated);
  }

  results.sort((a, b) => b.days_absent - a.days_absent);
  return results.slice(0, LIST_LIMIT);
}
