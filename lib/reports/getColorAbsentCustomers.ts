import { createServerSupabase } from "@/lib/supabaseServer";
import { formatCustomerDisplayName } from "@/lib/reports/customerDisplayName";
import { filterColorCardCustomerIds } from "@/lib/reports/filterColorCardCustomersForSalon";
import {
  COLOR_CARD_TYPES,
  evaluateColorAbsentCustomer,
  isColorAppointmentService,
  isColorCardType,
  isLighteningCardType,
  type ColorAbsentCustomer,
} from "@/lib/reports/colorAbsentSegment";

const LIST_LIMIT = 12;
const chunkSize = 200;

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

  type RawCard = {
    customer_id: string;
    service_type: string;
    created_at: string;
    salon_id: number | null;
  };

  const rawCards: RawCard[] = [];
  for (const row of cards ?? []) {
    const cid = String((row as { customer_id?: unknown }).customer_id ?? "");
    const st = String((row as { service_type?: unknown }).service_type ?? "");
    if (!cid || !isColorCardType(st)) continue;
    rawCards.push({
      customer_id: cid,
      service_type: st,
      created_at: String((row as { created_at?: unknown }).created_at ?? ""),
      salon_id:
        (row as { salon_id?: unknown }).salon_id == null
          ? null
          : Number((row as { salon_id?: unknown }).salon_id),
    });
  }

  const candidateIds = [...new Set(rawCards.map((c) => c.customer_id))];
  if (!candidateIds.length) return [];

  const customersActiveInSalon = new Set<string>();

  for (let i = 0; i < candidateIds.length; i += chunkSize) {
    const chunk = candidateIds.slice(i, i + chunkSize);
    const [{ data: apptIds }, { data: saleIds }] = await Promise.all([
      supabase
        .from("appointments")
        .select("customer_id")
        .eq("salon_id", salonId)
        .in("customer_id", chunk),
      supabase
        .from("sales")
        .select("customer_id")
        .eq("salon_id", salonId)
        .in("customer_id", chunk)
        .not("customer_id", "is", null),
    ]);

    for (const a of apptIds ?? []) {
      const cid = String((a as { customer_id?: unknown }).customer_id ?? "");
      if (cid) customersActiveInSalon.add(cid);
    }
    for (const s of saleIds ?? []) {
      const cid = String((s as { customer_id?: unknown }).customer_id ?? "");
      if (cid) customersActiveInSalon.add(cid);
    }
  }

  const eligible = filterColorCardCustomerIds({
    cards: rawCards.map((c) => ({ customer_id: c.customer_id, salon_id: c.salon_id })),
    salonId,
    customersActiveInSalon,
  });

  type CardAgg = {
    hasLightening: boolean;
    lastCardAt: string | null;
  };

  const cardByCustomer = new Map<string, CardAgg>();

  for (const row of rawCards) {
    if (!eligible.has(row.customer_id)) continue;

    const agg = cardByCustomer.get(row.customer_id) ?? { hasLightening: false, lastCardAt: null };
    if (isLighteningCardType(row.service_type)) agg.hasLightening = true;
    if (row.created_at && (!agg.lastCardAt || row.created_at > agg.lastCardAt)) {
      agg.lastCardAt = row.created_at;
    }
    cardByCustomer.set(row.customer_id, agg);
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
      customerName: formatCustomerDisplayName(customersMap.get(cid), cid),
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
