"use client";

import type { ReactNode } from "react";
import type { CrmActionCustomer } from "@/lib/reports/getDirectionCrmActions";
import type { ColorAbsentCustomer } from "@/lib/reports/colorAbsentSegment";
import { formatReportMoney } from "@/components/reports/reportFormatMoney";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";
import ReportCrmCustomerActions from "@/components/reports/ReportCrmCustomerActions";

function CustomerOperationalRow({
  customerId,
  customerName,
  phone,
  reason,
  detail,
  grossTotal,
}: {
  customerId: string;
  customerName: string;
  phone?: string | null;
  reason: string;
  detail: string;
  grossTotal?: number;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-white">{customerName}</p>
        {phone ? (
          <p className="text-xs text-white/45">{phone}</p>
        ) : (
          <p className="text-xs text-white/30">Telefono non disponibile</p>
        )}
        <p className="mt-1 text-xs font-bold text-scz-gold/80">{reason}</p>
        <p className="truncate text-xs text-white/40">{detail}</p>
        {grossTotal != null && grossTotal > 0 ? (
          <p className="text-xs text-white/35">Spesa: {formatReportMoney(grossTotal)}</p>
        ) : null}
      </div>
      <ReportCrmCustomerActions customerId={customerId} phone={phone} compact />
    </li>
  );
}

function ColorAbsentRow({ customer }: { customer: ColorAbsentCustomer }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-500/15 bg-purple-500/5 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-white">{customer.customer_name}</p>
        {customer.phone ? (
          <p className="text-xs text-white/45">{customer.phone}</p>
        ) : (
          <p className="text-xs text-white/30">Telefono non disponibile</p>
        )}
        <p className="mt-1 text-xs font-bold text-purple-200/80">Colore assente</p>
        <p className="text-xs text-white/40">
          Ultimo colore: {customer.last_color_label} · {customer.days_absent} gg (soglia{" "}
          {customer.threshold_days})
        </p>
      </div>
      <ReportCrmCustomerActions customerId={customer.customer_id} phone={customer.phone} compact />
    </li>
  );
}

function SegmentPanel({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: ReactNode;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-scz-dark overflow-hidden">
      <div className="border-b border-white/10 bg-black/25 px-5 py-4 flex items-center justify-between">
        <p className="text-sm font-extrabold text-white">{title}</p>
        <span className="rounded-full bg-scz-gold/15 px-2.5 py-1 text-xs font-black text-scz-gold">
          {count}
        </span>
      </div>
      <ul className="divide-y divide-white/5 p-3 space-y-2">
        {count === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-white/35">{empty}</li>
        ) : (
          children
        )}
      </ul>
    </div>
  );
}

type Props = {
  clientsReport: {
    totals: {
      customers_total: number;
      new_customers: number;
      returning_customers: number;
      repeat_rate: number;
      customers_with_retail?: number;
      customers_without_retail?: number;
      retail_penetration_pct?: number | null;
    };
    topSpenders: Array<{
      customer_id: string;
      customer_name: string;
      visits: number;
      gross_total: number;
      phone?: string | null;
      detail?: string;
    }>;
  };
  crm: {
    notReturned60: CrmActionCustomer[];
    notReturned90: CrmActionCustomer[];
    topSpenders: CrmActionCustomer[];
    noShowCustomers: CrmActionCustomer[];
    noRetailBuyers: CrmActionCustomer[];
    colorAbsent: ColorAbsentCustomer[];
  };
};

export default function ReportClientiSection({ clientsReport, crm }: Props) {
  const t = clientsReport.totals;
  const periodTop = clientsReport.topSpenders.map((c) => ({
    customer_id: c.customer_id,
    customer_name: c.customer_name,
    detail: c.detail ?? `${c.visits} visite nel periodo`,
    gross_total: c.gross_total,
    phone: c.phone ?? null,
  }));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-white">Clienti</h2>
        <p className="mt-1 text-sm text-white/50">Segmenti operativi · richiami, colore e retail</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase text-white/40">Clienti serviti</p>
          <p className="mt-1 text-2xl font-extrabold text-white">{t.customers_total}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase text-white/40">Retail nel periodo</p>
          <p className="mt-1 text-2xl font-extrabold text-scz-gold">
            {formatRetailPenetrationPct(t.retail_penetration_pct ?? null)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase text-white/40">Clienti senza prodotti</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-200/90">
            {t.customers_without_retail ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase text-white/40">Colore assenti</p>
          <p className="mt-1 text-2xl font-extrabold text-purple-200/90">{crm.colorAbsent.length}</p>
        </div>
      </div>

      <SegmentPanel
        title="Clienti colore assenti"
        count={crm.colorAbsent.length}
        empty="Nessun cliente oltre la soglia colore"
      >
        {crm.colorAbsent.slice(0, 10).map((c) => (
          <ColorAbsentRow key={c.customer_id} customer={c} />
        ))}
      </SegmentPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        <SegmentPanel
          title="Da richiamare · 60 giorni"
          count={crm.notReturned60.length}
          empty="Nessun cliente oltre 60 giorni"
        >
          {crm.notReturned60.slice(0, 10).map((c) => (
            <CustomerOperationalRow
              key={c.customer_id}
              customerId={c.customer_id}
              customerName={c.customer_name}
              phone={c.phone}
              reason="Da richiamare"
              detail={c.detail}
              grossTotal={c.gross_total}
            />
          ))}
        </SegmentPanel>
        <SegmentPanel
          title="Da richiamare · 90 giorni"
          count={crm.notReturned90.length}
          empty="Nessun cliente oltre 90 giorni"
        >
          {crm.notReturned90.slice(0, 10).map((c) => (
            <CustomerOperationalRow
              key={c.customer_id}
              customerId={c.customer_id}
              customerName={c.customer_name}
              phone={c.phone}
              reason="Da richiamare"
              detail={c.detail}
              grossTotal={c.gross_total}
            />
          ))}
        </SegmentPanel>
        <SegmentPanel title="No-show" count={crm.noShowCustomers.length} empty="Nessun no-show registrato">
          {crm.noShowCustomers.slice(0, 10).map((c) => (
            <CustomerOperationalRow
              key={c.customer_id}
              customerId={c.customer_id}
              customerName={c.customer_name}
              phone={c.phone}
              reason="No-show"
              detail={c.detail}
            />
          ))}
        </SegmentPanel>
        <SegmentPanel
          title="Senza prodotti"
          count={crm.noRetailBuyers.length}
          empty="Tutti i clienti attivi hanno acquistato retail"
        >
          {crm.noRetailBuyers.slice(0, 10).map((c) => (
            <CustomerOperationalRow
              key={c.customer_id}
              customerId={c.customer_id}
              customerName={c.customer_name}
              phone={c.phone}
              reason="Senza prodotti"
              detail={c.detail}
              grossTotal={c.gross_total}
            />
          ))}
        </SegmentPanel>
      </div>

      <SegmentPanel
        title="Migliori clienti · periodo"
        count={periodTop.length}
        empty="Nessuna spesa nel periodo filtrato"
      >
        {periodTop.slice(0, 10).map((c) => (
          <CustomerOperationalRow
            key={c.customer_id}
            customerId={c.customer_id}
            customerName={c.customer_name}
            phone={c.phone}
            reason="Migliori clienti"
            detail={c.detail}
            grossTotal={c.gross_total}
          />
        ))}
      </SegmentPanel>
    </section>
  );
}
