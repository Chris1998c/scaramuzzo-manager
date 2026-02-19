// lib/servicesCatalog.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceRow = {
  id: number;
  name: string;
  color_code: string | null;
  duration: number | null;
  need_processing: boolean | null;
  vat_rate: number | string | null;
};

const BASE_SELECT =
  "id,name,color_code,duration,need_processing,vat_rate" as const;

// ✅ Per Agenda: solo attivi + visibili in agenda
export async function fetchAgendaServices(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("services")
    .select(BASE_SELECT)
    .eq("is_active", true)
    .eq("visible_in_agenda", true)
    .order("name");

  if (error) throw new Error(`fetchAgendaServices: ${error.message}`);
  return (data ?? []) as ServiceRow[];
}

// ✅ Per Cassa: solo attivi + visibili in cassa
export async function fetchCashServices(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("services")
    .select(BASE_SELECT)
    .eq("is_active", true)
    .eq("visible_in_cash", true)
    .order("name");

  if (error) throw new Error(`fetchCashServices: ${error.message}`);
  return (data ?? []) as ServiceRow[];
}
