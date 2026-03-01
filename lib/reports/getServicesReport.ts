// lib/reports/getServicesReport.ts

import { getSalonTurnover, TurnoverFilters } from "./getSalonTurnover";

export type ServiceTopRow = {
  key: string; // "service::<id>" oppure "service::<name>"
  service_id?: number | null;
  name: string;
  quantity: number;
  gross_total: number;
  net_total: number;
  avg_price: number; // lordo medio
};

export type ServicesReportTotals = {
  services_qty: number;
  services_gross_total: number;
  services_avg_price: number;
  // alias utile (così se in UI usi avg_service_price non rompi nulla)
  avg_service_price: number;
};

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getServicesReport(filters: TurnoverFilters) {
  // Forziamo itemType=service per avere SOLO servizi
  const { rows } = await getSalonTurnover({
    ...filters,
    itemType: "service",
  });

  const map = new Map<
    string,
    {
      service_id: number | null;
      name: string;
      quantity: number;
      gross_total: number;
      net_total: number;
    }
  >();

  for (const r of rows as any[]) {
    const sid = r.service_id != null ? Number(r.service_id) : null;
    const name = String(r.service_name ?? "Servizio");

    const qty = Math.max(0, n(r.quantity ?? 1));
    const gross = n(r.line_total_gross);
    const net = n(r.line_net);

    const key = sid ? `service::${sid}` : `service::${name}`;

    if (!map.has(key)) {
      map.set(key, {
        service_id: sid,
        name,
        quantity: 0,
        gross_total: 0,
        net_total: 0,
      });
    }

    const x = map.get(key)!;
    x.quantity += qty || 0;
    x.gross_total += gross;
    x.net_total += net;
  }

  const topServices: ServiceTopRow[] = Array.from(map.entries())
    .map(([key, x]) => ({
      key,
      service_id: x.service_id,
      name: x.name,
      quantity: x.quantity,
      gross_total: x.gross_total,
      net_total: x.net_total,
      avg_price: x.quantity > 0 ? x.gross_total / x.quantity : 0,
    }))
    .sort((a, b) => b.gross_total - a.gross_total)
    .slice(0, 30);

  const services_qty = topServices.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
  const services_gross_total = topServices.reduce((acc, r) => acc + (Number(r.gross_total) || 0), 0);
  const services_avg_price = services_qty > 0 ? services_gross_total / services_qty : 0;

  const totals: ServicesReportTotals = {
    services_qty,
    services_gross_total,
    services_avg_price,
    avg_service_price: services_avg_price,
  };

  return { totals, topServices };
}