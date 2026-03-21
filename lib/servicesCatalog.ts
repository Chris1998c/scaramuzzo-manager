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

/** Riga servizio per modulo Impostazioni (catalogo + visibilità + prezzo listino salone). */
export type ServiceSettingsRow = {
  id: number;
  name: string;
  duration: number | null;
  duration_active: number | null;
  duration_processing: number | null;
  need_processing: boolean | null;
  visible_in_agenda: boolean | null;
  visible_in_cash: boolean | null;
  color_code: string | null;
  active: boolean;
  category_id: number | null;
  category_name: string | null;
  price: number;
};

/**
 * Catalogo servizi (tutti) con categoria e prezzo del salone (`service_prices`).
 * Due query per categorie per evitare ambiguità sugli embed PostgREST.
 */
export async function fetchServicesForSettings(
  supabase: SupabaseClient,
  salonId: number,
): Promise<ServiceSettingsRow[]> {
  const { data: rows, error } = await supabase
    .from("services")
    .select(
      "id,name,duration,duration_active,duration_processing,need_processing,color_code,active,category_id,visible_in_agenda,visible_in_cash",
    )
    .order("name");

  if (error) throw new Error(`fetchServicesForSettings(services): ${error.message}`);

  const list = rows ?? [];
  const catIds = [
    ...new Set(
      list
        .map((r: any) => r.category_id)
        .filter((x: any) => x != null && Number.isFinite(Number(x))),
    ),
  ] as number[];

  const catMap = new Map<number, string>();
  if (catIds.length > 0) {
    const { data: cats, error: cErr } = await supabase
      .from("service_categories")
      .select("id, name")
      .in("id", catIds);

    if (cErr) throw new Error(`fetchServicesForSettings(categories): ${cErr.message}`);
    (cats ?? []).forEach((c: any) => {
      catMap.set(Number(c.id), String(c.name ?? ""));
    });
  }

  const ids = list.map((r: any) => Number(r.id)).filter((x) => Number.isFinite(x) && x > 0);
  const priceMap = new Map<string, number>();
  if (Number.isFinite(salonId) && salonId > 0 && ids.length > 0) {
    const { data: sp, error: spErr } = await supabase
      .from("service_prices")
      .select("service_id, price")
      .eq("salon_id", salonId)
      .in("service_id", ids);

    if (spErr) throw new Error(`fetchServicesForSettings(prices): ${spErr.message}`);
    (sp ?? []).forEach((r: any) => {
      priceMap.set(String(r.service_id), toNum(r.price, 0));
    });
  }

  return list.map((r: any) => {
    const id = Number(r.id);
    const cid = r.category_id != null ? Number(r.category_id) : null;
    return {
      id,
      name: String(r.name ?? ""),
      duration: r.duration != null ? Number(r.duration) : null,
      duration_active: r.duration_active != null ? Number(r.duration_active) : null,
      duration_processing: r.duration_processing != null ? Number(r.duration_processing) : null,
      need_processing: r.need_processing ?? null,
      visible_in_agenda: r.visible_in_agenda ?? null,
      visible_in_cash: r.visible_in_cash ?? null,
      color_code: r.color_code != null ? String(r.color_code) : null,
      active: !!r.active,
      category_id: cid != null && Number.isFinite(cid) ? cid : null,
      category_name: cid != null && catMap.has(cid) ? catMap.get(cid)! : null,
      price: priceMap.get(String(id)) ?? 0,
    };
  });
}