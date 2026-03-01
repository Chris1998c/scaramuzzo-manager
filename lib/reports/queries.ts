// lib/reports/queries.ts
import { createServerSupabase } from "@/lib/supabaseServer";

type BaseParams = {
  salonId: number;
  from: string;
  to: string;
  staffId?: number | null;
  paymentMethod?: string | null;
  itemType?: string | null;
};

export async function getTurnover(params: BaseParams) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("report_turnover", {
    p_salon_id: params.salonId,
    p_from: params.from,
    p_to: params.to,
    p_staff_id: params.staffId ?? null,
    p_payment_method: params.paymentMethod ?? null,
    p_item_type: params.itemType ?? null,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function getRows(params: BaseParams) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("report_rows", {
    p_salon_id: params.salonId,
    p_from: params.from,
    p_to: params.to,
    p_staff_id: params.staffId ?? null,
    p_payment_method: params.paymentMethod ?? null,
    p_item_type: params.itemType ?? null,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function getServicesSummary(params: BaseParams) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("report_services_summary", {
    p_salon_id: params.salonId,
    p_from: params.from,
    p_to: params.to,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function getStaffPerformance(params: BaseParams) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc(
    "report_staff_services_and_retail",
    {
      p_salon_id: params.salonId,
      p_from: params.from,
      p_to: params.to,
    }
  );

  if (error) throw new Error(error.message);
  return data;
}