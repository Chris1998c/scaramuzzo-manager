"use client";

import Link from "next/link";
import type { DirectionCrmActions } from "@/lib/reports/getDirectionCrmActions";
import { CRM_CATEGORY_LABELS, pickCrmActionQueue } from "@/lib/reports/getDirectionAlerts";
import ReportClientsKpiRow from "@/components/reports/ReportClientsKpiRow";
import ReportClientsNewCustomersTable from "@/components/reports/ReportClientsNewCustomersTable";
import ReportClientsTopSpendersTable from "@/components/reports/ReportClientsTopSpendersTable";

type Props = {
  clientsReport: {
    totals: {
      customers_total: number;
      new_customers: number;
      returning_customers: number;
      repeat_rate: number;
    };
    newCustomers: Array<{
      customer_id: string;
      customer_name: string;
      first_visit_day: string;
      visits_in_period: number;
    }>;
    topSpenders: Array<{
      customer_id: string;
      customer_name: string;
      visits: number;
      gross_total: number;
    }>;
  };
  crm: DirectionCrmActions;
};

function SegmentList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ customer_id: string; customer_name: string; detail: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-white/60">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-white/35">{empty}</li>
        ) : (
          items.slice(0, 5).map((c) => (
            <li
              key={c.customer_id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-white text-sm">{c.customer_name}</p>
                <p className="truncate text-xs text-white/40">{c.detail}</p>
              </div>
              <Link
                href={`/dashboard/clienti/${c.customer_id}`}
                className="shrink-0 text-xs font-bold text-scz-gold"
              >
                Profilo
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default function ReportClientiSection({ clientsReport, crm }: Props) {
  const actions = pickCrmActionQueue(crm, 5);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-white">Clienti</h2>
        <p className="mt-1 text-sm text-white/50">Periodo filtrato · segmenti e azioni CRM</p>
      </div>

      <ReportClientsKpiRow totals={clientsReport.totals} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SegmentList
          title="Da richiamare (60 gg)"
          items={crm.notReturned60.map((c) => ({
            customer_id: c.customer_id,
            customer_name: c.customer_name,
            detail: c.detail,
          }))}
          empty="Nessun cliente in questo segmento"
        />
        <SegmentList
          title="Senza prodotti"
          items={crm.noRetailBuyers.map((c) => ({
            customer_id: c.customer_id,
            customer_name: c.customer_name,
            detail: c.detail,
          }))}
          empty="Tutti i clienti attivi hanno acquistato retail"
        />
      </div>

      <ReportClientsNewCustomersTable rows={clientsReport.newCustomers as any} />
      <ReportClientsTopSpendersTable rows={clientsReport.topSpenders as any} />

      {actions.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-scz-dark p-4">
          <p className="text-xs font-black uppercase text-white/40">Azioni rapide</p>
          <ul className="mt-2 space-y-2">
            {actions.map((a) => (
              <li key={`${a.category}-${a.customer_id}`} className="flex justify-between text-sm">
                <span>
                  {a.customer_name} — {CRM_CATEGORY_LABELS[a.category]}
                </span>
                <Link
                  href={`/dashboard/clienti/${a.customer_id}`}
                  className="text-scz-gold font-bold"
                >
                  Apri
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

