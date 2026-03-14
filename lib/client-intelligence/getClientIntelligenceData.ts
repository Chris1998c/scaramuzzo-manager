import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Data-layer per il modulo Client Intelligence.
 * Recupera dati strutturati del cliente (solo lettura).
 */
export async function getClientIntelligenceData(customerId: string, salonId: number) {
  const cid = String(customerId ?? "").trim();
  const sid = Number(salonId);
  if (!cid || !Number.isFinite(sid)) {
    return {
      profile: null,
      lastServiceCards: [],
      recentAppointments: [],
      recentPurchases: { sales: [], saleItems: [] },
    };
  }

  const [
    { data: profile },
    { data: lastServiceCards },
    { data: recentAppointments },
    { data: sales },
  ] = await Promise.all([
    supabaseAdmin
      .from("customer_profile")
      .select("*")
      .eq("customer_id", cid)
      .maybeSingle(),
    supabaseAdmin
      .from("customer_service_cards")
      .select("id, customer_id, service_type, data, salon_id, staff_id, appointment_id, created_at")
      .eq("customer_id", cid)
      .order("created_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("appointments")
      .select("id, start_time, end_time, status, notes, staff_id")
      .eq("customer_id", cid)
      .eq("salon_id", sid)
      .order("start_time", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("sales")
      .select("id, total_amount, payment_method, date")
      .eq("customer_id", cid)
      .eq("salon_id", sid)
      .order("date", { ascending: false })
      .limit(10),
  ]);

  const saleIds = Array.isArray(sales) ? sales.map((s: any) => s.id).filter(Boolean) : [];
  let saleItems: any[] = [];
  if (saleIds.length > 0) {
    const { data: items } = await supabaseAdmin
      .from("sale_items")
      .select("id, sale_id, service_id, product_id, quantity, price, discount")
      .in("sale_id", saleIds);
    saleItems = Array.isArray(items) ? items : [];
  }

  return {
    profile: profile ?? null,
    lastServiceCards: Array.isArray(lastServiceCards) ? lastServiceCards : [],
    recentAppointments: Array.isArray(recentAppointments) ? recentAppointments : [],
    recentPurchases: {
      sales: Array.isArray(sales) ? sales : [],
      saleItems,
    },
  };
}
