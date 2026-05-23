"use client";

import Link from "next/link";
import { useState } from "react";
import type { DirectionReport } from "@/lib/reports/getDirectionReport";
import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import ReportVatToggle from "@/components/reports/ReportVatToggle";
import {
  formatReportInt,
  formatReportMoney,
  formatReportPct,
} from "@/components/reports/reportFormatMoney";

type Props = {
  data: DirectionReport;
  salonLabel?: string | null;
};

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-black text-white/50">
        —
      </span>
    );
  }
  const positive = value >= 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-black ${
        positive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
      }`}
    >
      {formatReportPct(value)}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  hero,
}: {
  label: string;
  value: string;
  sub?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 md:p-6 ${
        hero
          ? "border-scz-gold/35 bg-gradient-to-br from-scz-gold/10 via-black/20 to-transparent"
          : "border-white/10 bg-black/20"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p
        className={`mt-2 font-extrabold tracking-tight ${
          hero ? "text-4xl md:text-5xl text-scz-gold" : "text-2xl md:text-3xl text-white"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-white/40">{sub}</p> : null}
    </div>
  );
}

export default function ReportDirectionView({ data, salonLabel }: Props) {
  const [vatMode, setVatMode] = useState<VatDisplayMode>("gross");

  const pick = (period: typeof data.today) =>
    vatMode === "gross" ? period.money.gross : period.money.net;

  const todayMoney = pick(data.today);
  const monthMoney = pick(data.month);
  const avgTicket =
    vatMode === "gross" ? data.today.avg_ticket_gross : data.today.avg_ticket_net;
  const monthPct =
    vatMode === "gross"
      ? data.monthComparison.gross_real_pct
      : data.monthComparison.net_real_pct;

  const crmSections = [
    { key: "notReturned60", title: "Non tornati da 60 giorni", items: data.crm.notReturned60 },
    { key: "topSpenders", title: "Top spender", items: data.crm.topSpenders },
    { key: "noShowCustomers", title: "No-show in storico", items: data.crm.noShowCustomers },
    { key: "noRetailBuyers", title: "Senza acquisti prodotti", items: data.crm.noRetailBuyers },
  ] as const;

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-scz-gold/80">
            Centro decisionale
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            Riepilogo
          </h2>
          <p className="mt-1 text-sm text-white/45">
            {salonLabel ? `${salonLabel} · ` : ""}
            Snapshot operativo · aggiornato al caricamento pagina
          </p>
        </div>
        <ReportVatToggle mode={vatMode} onChange={setVatMode} />
      </div>

      <KpiCard
        label={`Incasso oggi · ${vatMode === "gross" ? "con IVA" : "senza IVA"}`}
        value={formatReportMoney(todayMoney.real)}
        sub={`${formatReportInt(data.today.receipts_count)} scontrini · ${formatReportInt(data.today.customers_count)} clienti`}
        hero
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Clienti oggi" value={formatReportInt(data.today.customers_count)} />
        <KpiCard label="Servizi oggi" value={formatReportInt(data.today.services_qty)} />
        <KpiCard label="Prodotti venduti" value={formatReportInt(data.today.products_qty)} />
        <KpiCard label="Ticket medio" value={formatReportMoney(avgTicket)} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-scz-dark p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Incasso mese corrente
            </p>
            <p className="mt-2 text-3xl font-extrabold text-white">
              {formatReportMoney(monthMoney.real)}
            </p>
          </div>
          <GrowthBadge value={monthPct} />
        </div>
        <p className="mt-2 text-xs text-white/40">
          vs periodo precedente di uguale durata · scontrini{" "}
          <GrowthBadge value={data.monthComparison.receipts_pct} />
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Valore pieno (senza sconti)"
          value={formatReportMoney(todayMoney.full)}
          sub="Listino teorico oggi"
        />
        <KpiCard
          label="Sconti applicati"
          value={formatReportMoney(todayMoney.discount)}
          sub="Separati dall'incasso reale"
        />
        <KpiCard
          label="Differenza pieno − reale"
          value={formatReportMoney(todayMoney.full - todayMoney.real)}
          sub="Deve coincidere con gli sconti"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-scz-dark overflow-hidden">
        <div className="border-b border-white/10 bg-black/25 px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-scz-gold/80">
            Azioni consigliate
          </p>
          <p className="mt-1 text-sm text-white/50">Clienti da richiamare · CRM operativo base</p>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-2">
          {crmSections.map((section) => (
            <div
              key={section.key}
              className="rounded-xl border border-white/10 bg-black/15 p-4"
            >
              <p className="text-xs font-black uppercase tracking-wider text-white/60">
                {section.title}
              </p>
              <ul className="mt-3 space-y-2">
                {section.items.length === 0 ? (
                  <li className="text-sm text-white/35">Nessun cliente in questo segmento</li>
                ) : (
                  section.items.map((c) => (
                    <li
                      key={c.customer_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-white">{c.customer_name}</p>
                        <p className="truncate text-xs text-white/40">{c.detail}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          href={`/dashboard/clienti/${c.customer_id}`}
                          className="rounded-lg border border-scz-gold/30 bg-scz-gold/10 px-3 py-1.5 text-xs font-bold text-scz-gold hover:bg-scz-gold/20"
                        >
                          Apri profilo
                        </Link>
                        <span
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-white/30"
                          title="WhatsApp bulk disponibile in Marketing"
                        >
                          WhatsApp
                        </span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 bg-black/20 px-6 py-3">
          <p className="text-xs text-white/35">
            Segmenti da appuntamenti e vendite reali (ultimi 12 mesi). Clienti oggi: distinct
            customer_id su scontrini — 0 se vendita senza cliente collegato.
          </p>
        </div>
      </div>
    </section>
  );
}
