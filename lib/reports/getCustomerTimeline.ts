import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildCustomerTimeline } from "@/lib/reports/buildCustomerTimeline";

export async function getCustomerTimeline(customerId: string, salonId: number) {
  const cid = String(customerId ?? "").trim();
  const sid = Number(salonId);
  if (!cid || !Number.isFinite(sid)) {
    return { entries: [], total_spent: 0 };
  }

  const [{ data: appointments }, { data: sales }] = await Promise.all([
    supabaseAdmin
      .from("appointments")
      .select(
        `
        id,
        start_time,
        status,
        services ( name ),
        appointment_services ( services ( name ) )
      `,
      )
      .eq("customer_id", cid)
      .eq("salon_id", sid)
      .order("start_time", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("sales")
      .select("id, total_amount, date")
      .eq("customer_id", cid)
      .eq("salon_id", sid)
      .order("date", { ascending: false })
      .limit(20),
  ]);

  const saleIds = (sales ?? []).map((s) => Number((s as { id?: unknown }).id)).filter(Boolean);
  let saleItems: Array<Record<string, unknown>> = [];
  if (saleIds.length) {
    const { data: items } = await supabaseAdmin
      .from("sale_items")
      .select("id, sale_id, service_id, product_id, quantity, price")
      .in("sale_id", saleIds);
    saleItems = (items ?? []) as Array<Record<string, unknown>>;
  }

  const saleDateById = new Map<number, string>();
  for (const s of sales ?? []) {
    const id = Number((s as { id?: unknown }).id);
    const d = String((s as { date?: unknown }).date ?? "").slice(0, 10);
    if (id && d) saleDateById.set(id, d);
  }

  const [{ data: servicesMeta }, { data: productsMeta }] = await Promise.all([
    supabaseAdmin.from("services").select("id, name"),
    supabaseAdmin.from("products").select("id, name"),
  ]);

  const serviceName = new Map<string, string>();
  for (const s of servicesMeta ?? []) {
    serviceName.set(String((s as { id?: unknown }).id), String((s as { name?: unknown }).name ?? "Servizio"));
  }
  const productName = new Map<string, string>();
  for (const p of productsMeta ?? []) {
    productName.set(String((p as { id?: unknown }).id), String((p as { name?: unknown }).name ?? "Prodotto"));
  }

  return buildCustomerTimeline({
    appointments: (appointments ?? []).map((a) => {
      const header = (a as { services?: { name?: string } | null }).services?.name;
      const lines = (a as { appointment_services?: Array<{ services?: { name?: string } | null }> })
        .appointment_services;
      const lineName = lines?.[0]?.services?.name;
      return {
        id: (a as { id?: unknown }).id as number | string,
        start_time: (a as { start_time?: string }).start_time,
        status: (a as { status?: string }).status,
        service_label: header ?? lineName ?? null,
      };
    }),
    sales: (sales ?? []).map((s) => ({
      id: (s as { id?: unknown }).id as number | string,
      date: (s as { date?: string }).date,
      total_amount: Number((s as { total_amount?: unknown }).total_amount ?? 0),
    })),
    saleItems: saleItems.map((it) => {
      const saleId = Number(it.sale_id);
      const sidRaw = it.service_id != null ? String(it.service_id) : null;
      const pidRaw = it.product_id != null ? String(it.product_id) : null;
      const label = pidRaw
        ? productName.get(pidRaw) ?? "Prodotto"
        : sidRaw
          ? serviceName.get(sidRaw) ?? "Servizio"
          : "Voce";
      return {
        id: it.id as number | string,
        sale_id: it.sale_id as number | string,
        service_id: it.service_id as string | null,
        product_id: it.product_id as string | null,
        quantity: Number(it.quantity ?? 1),
        price: Number(it.price ?? 0),
        sale_date: saleDateById.get(saleId) ?? null,
        label,
      };
    }),
  });
}
