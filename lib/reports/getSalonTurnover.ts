// lib/reports/getSalonTurnover.ts

import { createServerSupabase } from "@/lib/supabaseServer";

export type TurnoverFilters = {
  salonId: number;
  dateFrom: string;
  dateTo: string;
  staffId?: number | null;
  paymentMethod?: string | null;
  itemType?: string | null;
};

export async function getSalonTurnover(filters: TurnoverFilters) {
  const supabase = await createServerSupabase();

  const {
    salonId,
    dateFrom,
    dateTo,
    staffId = null,
    paymentMethod = null,
    itemType = null,
  } = filters;

  const { data: totalsData, error: totalsError } = await supabase.rpc(
    "report_turnover",
    {
      p_salon_id: salonId,
      p_from: dateFrom,
      p_to: dateTo,
      p_staff_id: staffId,
      p_payment_method: paymentMethod,
      p_item_type: itemType,
    }
  );

  if (totalsError) throw new Error(totalsError.message);

  const totals =
    Array.isArray(totalsData) && totalsData.length > 0
      ? totalsData[0]
      : {
          receipts_count: 0,
          gross_total: 0,
          net_total: 0,
          vat_total: 0,
          discount_total: 0,
          gross_services: 0,
          gross_products: 0,
        };

  const { data: rowsData, error: rowsError } = await supabase.rpc("report_rows", {
    p_salon_id: salonId,
    p_from: dateFrom,
    p_to: dateTo,
    p_staff_id: staffId,
    p_payment_method: paymentMethod,
    p_item_type: itemType,
  });

  if (rowsError) throw new Error(rowsError.message);

  return {
    totals,
    rows: rowsData ?? [],
  };
}