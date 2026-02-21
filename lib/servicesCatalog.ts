// lib/servicesCatalog.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceRow = {
  id: number;
  name: string;
  color_code: string | null;
  duration: number | null;
  need_processing: boolean | null;
  vat_rate: number | string | null;

  // ✅ prezzo per salone (service_prices)
  price: number;
};

const BASE_SELECT =
  "id,name,color_code,duration,need_processing,vat_rate" as const;

function toNum(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

async function attachPrices(
  supabase: SupabaseClient,
  salonId: number,
  services: Array<Omit<ServiceRow, "price">>,
) {
  const ids = services.map((s) => s.id).filter((x) => Number.isFinite(x) && x > 0);
  if (!Number.isFinite(salonId) || salonId <= 0 || ids.length === 0) {
    return services.map((s) => ({ ...s, price: 0 })) as ServiceRow[];
  }

  const { data: sp, error: spErr } = await supabase
    .from("service_prices")
    .select("service_id, price")
    .eq("salon_id", salonId)
    .in("service_id", ids);

  if (spErr) throw new Error(`attachPrices(service_prices): ${spErr.message}`);

  const priceMap = new Map<string, number>();
  (sp ?? []).forEach((r: any) => {
    priceMap.set(String(r.service_id), toNum(r.price, 0));
  });

  return services.map((s) => ({
    ...s,
    price: priceMap.get(String(s.id)) ?? 0,
  })) as ServiceRow[];
}

// ✅ Per Agenda: solo attivi + visibili in agenda + prezzo del salone
export async function fetchAgendaServices(
  supabase: SupabaseClient,
  salonId: number,
) {
  const { data, error } = await supabase
    .from("services")
    .select(BASE_SELECT)
    .eq("active", true)
    .eq("visible_in_agenda", true)
    .order("name");

  if (error) throw new Error(`fetchAgendaServices: ${error.message}`);

  const base = (data ?? []) as Array<Omit<ServiceRow, "price">>;
  return attachPrices(supabase, salonId, base);
}

// ✅ Per Cassa: solo attivi + visibili in cassa + prezzo del salone
export async function fetchCashServices(
  supabase: SupabaseClient,
  salonId: number,
) {
  const { data, error } = await supabase
    .from("services")
    .select(BASE_SELECT)
    .eq("active", true)
    .eq("visible_in_cash", true)
    .order("name");

  if (error) throw new Error(`fetchCashServices: ${error.message}`);

  const base = (data ?? []) as Array<Omit<ServiceRow, "price">>;
  return attachPrices(supabase, salonId, base);
}