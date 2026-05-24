// lib/reports/getClientsReport.ts
import { createServerSupabase } from "@/lib/supabaseServer";
import {
  SALES_LEDGER_OPERATION_TYPE,
  SALES_LEDGER_STATUS,
} from "@/lib/reports/ledgerSalesFilter";

export type ClientsReportFilters = {
  salonId: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  staffId?: number | null;
  paymentMethod?: string | null;
};

function isoStart(d: string) {
  return `${d}T00:00:00`;
}
function isoEnd(d: string) {
  return `${d}T23:59:59.999`;
}
function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function nameOf(c: any, customerId?: string) {
  const fn = String(c?.first_name ?? "").trim();
  const ln = String(c?.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  const phone = String(c?.phone ?? "").trim();
  if (phone) return phone;
  const email = String(c?.email ?? "").trim();
  if (email) return email;
  if (customerId) return `Cliente #${customerId}`;
  return "Cliente";
}

async function loadCustomersByIds(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  ids: string[],
) {
  const customersMap = new Map<string, any>();
  if (!ids.length) return customersMap;

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, customer_code, first_name, last_name, phone, email, marketing_whatsapp_opt_in")
      .in("id", chunk);

    if (custErr) throw new Error(custErr.message);
    for (const c of (customers ?? []) as any[]) {
      if (c?.id) customersMap.set(String(c.id), c);
    }
  }

  return customersMap;
}

export async function getClientsReport(filters: ClientsReportFilters) {
  const supabase = await createServerSupabase();
  const { salonId, dateFrom, dateTo, staffId = null, paymentMethod = null } = filters;

  // 1) Appuntamenti nel periodo (serve per nuove/ritorno/frequenza)
  let apptQuery = supabase
    .from("appointments")
    .select("id, customer_id, start_time, status, staff_id")
    .eq("salon_id", salonId)
    .gte("start_time", isoStart(dateFrom))
    .lte("start_time", isoEnd(dateTo));

  if (staffId != null) {
    apptQuery = apptQuery.eq("staff_id", staffId);
  }

  const { data: appts, error: apptErr } = await apptQuery;

  if (apptErr) throw new Error(apptErr.message);

  const apptList = Array.isArray(appts) ? appts : [];

  // customer_id list
  const customerIds = Array.from(
    new Set(apptList.map((a: any) => a.customer_id).filter(Boolean).map(String))
  );

  // 2) Customers anagrafica (per nomi e telefono)
  const customersMap = await loadCustomersByIds(supabase, customerIds);

  // 3) Prima visita di ciascun cliente (tutto storico, per capire “nuovo”)
  // Nota: query minima per customerIds, non tutto DB
  const firstVisitMap = new Map<string, string>(); // customerId -> YYYY-MM-DD
  if (customerIds.length) {
    // prendo tutte le date appuntamenti del cliente (storico) e poi min in JS
    let allApptsQuery = supabase
      .from("appointments")
      .select("customer_id, start_time, staff_id")
      .eq("salon_id", salonId)
      .in("customer_id", customerIds);

    if (staffId != null) {
      allApptsQuery = allApptsQuery.eq("staff_id", staffId);
    }

    const { data: allAppts, error: allErr } = await allApptsQuery;

    if (allErr) throw new Error(allErr.message);

    for (const a of (allAppts ?? []) as any[]) {
      const cid = a?.customer_id ? String(a.customer_id) : null;
      const day = a?.start_time ? String(a.start_time).slice(0, 10) : null;
      if (!cid || !day) continue;
      const prev = firstVisitMap.get(cid);
      if (!prev || day < prev) firstVisitMap.set(cid, day);
    }
  }

  // 4) Visits in periodo per cliente
  const visitsInPeriod = new Map<string, number>();
  for (const a of apptList as any[]) {
    const cid = a?.customer_id ? String(a.customer_id) : null;
    if (!cid) continue;
    visitsInPeriod.set(cid, (visitsInPeriod.get(cid) ?? 0) + 1);
  }

  // 5) Nuovi vs ritorno (ritorno = almeno 2 visite nel periodo)
  let customersTotal = customerIds.length;
  let newCustomers = 0;
  let returningCustomers = 0;

  const newCustomersRows: any[] = [];

  for (const cid of customerIds) {
    const firstVisit = firstVisitMap.get(cid) ?? null;
    const visits = visitsInPeriod.get(cid) ?? 0;

    if (firstVisit && firstVisit >= dateFrom && firstVisit <= dateTo) {
      newCustomers += 1;
      newCustomersRows.push({
        customer_id: cid,
        customer_name: nameOf(customersMap.get(cid), cid),
        first_visit_day: firstVisit,
        visits_in_period: visits,
      });
    }

    if (visits >= 2) returningCustomers += 1;
  }

  const repeatRate = customersTotal > 0 ? (returningCustomers / customersTotal) * 100 : 0;

  // 6) Top spender: basato su sales nel periodo (se sales ha customer_id)
  // Se customer_id non c’è su sales, lo collegheremo via appointment_id in un secondo step.
  const topSpenders: any[] = [];
  let salesQuery = supabase
    .from("sales")
    .select("id, customer_id, total_amount, date, payment_method")
    .eq("salon_id", salonId)
    .eq("status", SALES_LEDGER_STATUS)
    .eq("operation_type", SALES_LEDGER_OPERATION_TYPE)
    .gte("date", isoStart(dateFrom))
    .lte("date", isoEnd(dateTo));

  if (paymentMethod) {
    salesQuery = salesQuery.eq("payment_method", paymentMethod);
  }

  const { data: sales, error: salesErr } = await salesQuery;

  if (salesErr) throw new Error(salesErr.message);

  const spendMap = new Map<string, { gross: number; visits: number }>();
  for (const s of (sales ?? []) as any[]) {
    const cid = s?.customer_id ? String(s.customer_id) : null;
    if (!cid) continue;
    const amt = n(s.total_amount);
    if (!spendMap.has(cid)) spendMap.set(cid, { gross: 0, visits: 0 });
    const x = spendMap.get(cid)!;
    x.gross += amt;
    x.visits += 1;
  }

  const spenderIds = [...spendMap.keys()].filter((cid) => !customersMap.has(cid));
  if (spenderIds.length) {
    const extra = await loadCustomersByIds(supabase, spenderIds);
    for (const [cid, row] of extra.entries()) {
      customersMap.set(cid, row);
    }
  }

  for (const [cid, v] of spendMap.entries()) {
    topSpenders.push({
      customer_id: cid,
      customer_name: nameOf(customersMap.get(cid), cid),
      visits: v.visits,
      gross_total: v.gross,
    });
  }

  topSpenders.sort((a, b) => b.gross_total - a.gross_total);

  // 7) Retail penetration nel periodo (clienti appuntamento con almeno 1 prodotto)
  const saleIds: number[] = [];
  const saleCustomer = new Map<number, string>();
  for (const s of (sales ?? []) as any[]) {
    const sid = Number(s?.id);
    const cid = s?.customer_id ? String(s.customer_id) : null;
    if (Number.isFinite(sid) && sid > 0) {
      saleIds.push(sid);
      if (cid) saleCustomer.set(sid, cid);
    }
  }

  const productBuyers = new Set<string>();
  if (saleIds.length) {
    const chunkSize = 200;
    for (let i = 0; i < saleIds.length; i += chunkSize) {
      const chunk = saleIds.slice(i, i + chunkSize);
      const { data: items, error: itemsErr } = await supabase
        .from("sale_items")
        .select("sale_id, product_id")
        .in("sale_id", chunk)
        .not("product_id", "is", null);

      if (itemsErr) throw new Error(itemsErr.message);

      for (const it of items ?? []) {
        const saleId = Number((it as { sale_id?: unknown }).sale_id);
        const cid = saleCustomer.get(saleId);
        if (cid) productBuyers.add(cid);
      }
    }
  }

  const customersWithRetail = customerIds.filter((cid) => productBuyers.has(cid)).length;
  const customersWithoutRetail = Math.max(0, customersTotal - customersWithRetail);
  const retailPenetrationPct =
    customersTotal > 0
      ? Math.round((customersWithRetail / customersTotal) * 1000) / 10
      : null;

  function customerPhone(cid: string): string | null {
    const p = String(customersMap.get(cid)?.phone ?? "").trim();
    return p || null;
  }

  return {
    totals: {
      customers_total: customersTotal,
      new_customers: newCustomers,
      returning_customers: returningCustomers,
      repeat_rate: repeatRate,
      customers_with_retail: customersWithRetail,
      customers_without_retail: customersWithoutRetail,
      retail_penetration_pct: retailPenetrationPct,
    },
    newCustomers: newCustomersRows.sort((a, b) => (a.first_visit_day < b.first_visit_day ? -1 : 1)),
    topSpenders: topSpenders.slice(0, 20).map((r) => ({
      ...r,
      phone: customerPhone(r.customer_id),
      detail: `Spesa periodo ${r.gross_total.toFixed(2)} €`,
    })),
  };
}