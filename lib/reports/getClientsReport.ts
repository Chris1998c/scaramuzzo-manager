// lib/reports/getClientsReport.ts
import { createServerSupabase } from "@/lib/supabaseServer";

export type ClientsReportFilters = {
  salonId: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
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
function nameOf(c: any) {
  const fn = String(c?.first_name ?? "").trim();
  const ln = String(c?.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || String(c?.name ?? "Cliente");
}

export async function getClientsReport(filters: ClientsReportFilters) {
  const supabase = await createServerSupabase();
  const { salonId, dateFrom, dateTo } = filters;

  // 1) Appuntamenti nel periodo (serve per nuove/ritorno/frequenza)
  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select("id, customer_id, start_time, status")
    .eq("salon_id", salonId)
    .gte("start_time", isoStart(dateFrom))
    .lte("start_time", isoEnd(dateTo));

  if (apptErr) throw new Error(apptErr.message);

  const apptList = Array.isArray(appts) ? appts : [];

  // customer_id list
  const customerIds = Array.from(
    new Set(apptList.map((a: any) => a.customer_id).filter(Boolean).map(String))
  );

  // 2) Customers anagrafica (per nomi)
  const customersMap = new Map<string, any>();
  if (customerIds.length) {
    const { data: customers, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, name")
      .in("id", customerIds);

    if (custErr) throw new Error(custErr.message);
    for (const c of (customers ?? []) as any[]) {
      if (c?.id) customersMap.set(String(c.id), c);
    }
  }

  // 3) Prima visita di ciascun cliente (tutto storico, per capire “nuovo”)
  // Nota: query minima per customerIds, non tutto DB
  const firstVisitMap = new Map<string, string>(); // customerId -> YYYY-MM-DD
  if (customerIds.length) {
    // prendo tutte le date appuntamenti del cliente (storico) e poi min in JS
    const { data: allAppts, error: allErr } = await supabase
      .from("appointments")
      .select("customer_id, start_time")
      .eq("salon_id", salonId)
      .in("customer_id", customerIds);

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
        customer_name: nameOf(customersMap.get(cid)),
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
  const { data: sales, error: salesErr } = await supabase
    .from("sales")
    .select("id, customer_id, total_amount, date")
    .eq("salon_id", salonId)
    .gte("date", isoStart(dateFrom))
    .lte("date", isoEnd(dateTo));

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

  for (const [cid, v] of spendMap.entries()) {
    topSpenders.push({
      customer_id: cid,
      customer_name: nameOf(customersMap.get(cid)),
      visits: v.visits,
      gross_total: v.gross,
    });
  }

  topSpenders.sort((a, b) => b.gross_total - a.gross_total);

  return {
    totals: {
      customers_total: customersTotal,
      new_customers: newCustomers,
      returning_customers: returningCustomers,
      repeat_rate: repeatRate,
    },
    newCustomers: newCustomersRows.sort((a, b) => (a.first_visit_day < b.first_visit_day ? -1 : 1)),
    topSpenders: topSpenders.slice(0, 20),
  };
}