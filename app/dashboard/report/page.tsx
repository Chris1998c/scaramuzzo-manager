// app/dashboard/report/page.tsx

import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getUserAccess } from "@/lib/getUserAccess";
import {
  normalizeReportTab,
  pickDefaultSalonIdForReport,
  type ReportTabKey,
} from "@/lib/reportSalonResolve";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchActiveStaffForSalon } from "@/lib/staffForSalon";

import { getSalonTurnoverAnalytics } from "@/lib/reports/getSalonTurnoverAnalytics";
import { getCashSessionsReport } from "@/lib/reports/getCashSessionsReport";
import { getAgendaReport } from "@/lib/reports/getAgendaReport";
import { getClientsReport } from "@/lib/reports/getClientsReport";
import { getServicesReport } from "@/lib/reports/getServicesReport";
import { getProductsReport } from "@/lib/reports/getProductsReport";
import { getWhatsAppReminderLog } from "@/lib/reports/getWhatsAppReminderLog";

import ReportSalonSync from "./ReportSalonSync";
import ReportFilters from "@/components/reports/ReportFilters";

import ReportKpiRow from "@/components/reports/ReportKpiRow";
import ReportPeriodComparison from "@/components/reports/ReportPeriodComparison";
import ReportRowsTable from "@/components/reports/ReportRowsTable";
import ReportDailyTable from "@/components/reports/ReportDailyTable";
import ReportTopItemsTable from "@/components/reports/ReportTopItemsTable";
import ReportStaffPerformanceTable from "@/components/reports/ReportStaffPerformanceTable";

import ReportCashKpiRow from "@/components/reports/ReportCashKpiRow";
import ReportCashSessionsTable from "@/components/reports/ReportCashSessionsTable";

import ReportAgendaKpiRow from "@/components/reports/ReportAgendaKpiRow";
import ReportAgendaNoShowTable from "@/components/reports/ReportAgendaNoShowTable";
import ReportAgendaStaffUtilizationTable from "@/components/reports/ReportAgendaStaffUtilizationTable";

import ReportClientsKpiRow from "@/components/reports/ReportClientsKpiRow";
import ReportClientsNewCustomersTable from "@/components/reports/ReportClientsNewCustomersTable";
import ReportClientsTopSpendersTable from "@/components/reports/ReportClientsTopSpendersTable";

import ReportServicesKpiRow from "@/components/reports/ReportServicesKpiRow";
import ReportServicesTopTable from "@/components/reports/ReportServicesTopTable";

import ReportProductsKpiRow from "@/components/reports/ReportProductsKpiRow";
import ReportProductsTopTable from "@/components/reports/ReportProductsTopTable";
import ReportProductsLowStockTable from "@/components/reports/ReportProductsLowStockTable";
import ReportWhatsAppRemindersTable from "@/components/reports/ReportWhatsAppRemindersTable";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function toInt(x: string | undefined) {
  const n = x ? Number(x) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

type ReportPageSearchParams = Record<string, string | string[] | undefined>;

function mergeReportRedirectQuery(
  sp: ReportPageSearchParams,
  overrides: Record<string, string>,
): string {
  const p = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (raw === undefined) continue;
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (first === undefined || first === "") continue;
    p.set(key, String(first));
  }
  for (const [k, v] of Object.entries(overrides)) {
    p.set(k, v);
  }
  return p.toString();
}

function EmptyDataNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-5 py-6 text-center text-sm text-white/55 leading-relaxed">
      {children}
    </div>
  );
}

type ReportPageProps = {
  searchParams?: Promise<ReportPageSearchParams>;
};

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const sp = (await searchParams) ?? {};

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");
  const access = await getUserAccess();
  if (access.role !== "coordinator") redirect("/dashboard");

  const dateFrom = (sp.date_from as string | undefined) ?? startOfMonthISO();
  const dateTo = (sp.date_to as string | undefined) ?? todayISO();
  const staffId = toInt(sp.staff_id as string | undefined);
  const paymentMethod = (sp.payment_method as string | undefined) ?? null;
  const itemType = (sp.item_type as string | undefined) ?? null;

  const tab = normalizeReportTab(sp.tab);

  const rawSalon = sp.salon_id;
  const querySalonNum =
    typeof rawSalon === "string"
      ? Number(rawSalon)
      : Array.isArray(rawSalon)
        ? Number(rawSalon[0])
        : NaN;

  const allowedIds = access.allowedSalonIds;
  let salonId: number;

  if (
    Number.isFinite(querySalonNum) &&
    querySalonNum > 0 &&
    allowedIds.includes(querySalonNum)
  ) {
    salonId = querySalonNum;
  } else {
    const fb = pickDefaultSalonIdForReport(allowedIds, access.defaultSalonId);
    if (fb != null) {
      redirect(
        `/dashboard/report?${mergeReportRedirectQuery(sp, {
          salon_id: String(fb),
          date_from: dateFrom,
          date_to: dateTo,
          tab,
        })}`,
      );
    }
    salonId = 0;
  }

  const reportSalonLabel =
    salonId > 0
      ? access.allowedSalons.find((s) => s.id === salonId)?.name ?? null
      : null;

  // Staff dropdown (serve sempre) — staff_salons + legacy staff.salon_id
  const staffRows = salonId ? await fetchActiveStaffForSalon(supabaseAdmin, salonId, "id, name") : [];

  const staffOptions =
    (staffRows ?? [])
      .filter((s: any) => s?.id != null)
      .map((s: any) => ({
        id: Number(s.id),
        name: String(s.name ?? `Staff ${s.id}`),
      }));

  const baseParams: Record<string, string> = {
    ...(salonId ? { salon_id: String(salonId) } : {}),
    date_from: dateFrom,
    date_to: dateTo,
  };
  if (staffId) baseParams.staff_id = String(staffId);
  if (paymentMethod) baseParams.payment_method = paymentMethod;
  if (itemType) baseParams.item_type = itemType;

  // === DATA (SOLO TAB ATTIVO) ===

  // Vendite tabs
  const needSales = salonId && ["turnover", "daily", "top", "staff"].includes(tab);

  const salesAnalytics = needSales
    ? await getSalonTurnoverAnalytics({
        salonId,
        dateFrom,
        dateTo,
        staffId,
        paymentMethod,
        itemType,
      })
    : {
        totals: {
          receipts_count: 0,
          gross_total: 0,
          net_total: 0,
          vat_total: 0,
          discount_total: 0,
          gross_services: 0,
          gross_products: 0,
        },
        rows: [],
        daily: [],
        topItems: [],
        staffPerformance: [],
        previousTotals: { gross_total: 0, net_total: 0, receipts_count: 0 },
      };

  // Cassa
  const cashReport =
    salonId && tab === "cassa"
      ? await getCashSessionsReport({ salonId, dateFrom, dateTo })
      : { sessions: [], totals: { sessions: 0, gross_total: 0, gross_cash: 0, gross_card: 0 } };

  // Agenda
  const agendaReport =
    salonId && tab === "agenda"
      ? await getAgendaReport({ salonId, dateFrom, dateTo })
      : {
          totals: { appointments: 0, done: 0, no_show: 0, cancelled: 0, in_sala: 0, completion_rate: 0 },
          daily: [],
          staffUtilization: [],
        };

  // Clienti
  const clientsReport =
    salonId && tab === "clienti"
      ? await getClientsReport({
          salonId,
          dateFrom,
          dateTo,
          staffId,
          paymentMethod,
        })
      : {
          totals: { customers_total: 0, new_customers: 0, returning_customers: 0, repeat_rate: 0 },
          newCustomers: [],
          topSpenders: [],
        };

  // Servizi
  const servicesReport =
    salonId && tab === "servizi"
      ? await getServicesReport({
          salonId,
          dateFrom,
          dateTo,
          staffId,
          paymentMethod,
          itemType,
        } as any)
      : { totals: { services_qty: 0, services_gross_total: 0, services_avg_price: 0 }, topServices: [] };

  // Prodotti
  const productsReport =
    salonId && tab === "prodotti"
      ? await getProductsReport({
          salonId,
          dateFrom,
          dateTo,
          staffId,
          paymentMethod,
        })
      : { totals: { products_qty: 0, products_gross: 0, low_stock_count: 0 }, topProducts: [], lowStock: [] };

  const waReminderLog =
    salonId && tab === "whatsapp_reminders"
      ? await getWhatsAppReminderLog({ salonId, dateFrom, dateTo })
      : { rows: [], totals: { sent: 0, error: 0, processing: 0 } };

  const { totals, rows, daily, topItems, staffPerformance, previousTotals } = salesAnalytics;

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ReportSalonSync />
      </Suspense>

      <ReportFilters
        salonId={salonId}
        salonLabel={reportSalonLabel}
        dateFrom={dateFrom}
        dateTo={dateTo}
        staffId={staffId}
        paymentMethod={paymentMethod}
        itemType={itemType}
        staffOptions={staffOptions}
      />

      {salonId <= 0 ? (
        <EmptyDataNote>
          <span className="font-bold text-amber-100/90">Nessuna sede disponibile</span>
          <br />
          Non è possibile generare report senza almeno un salone associato al coordinatore. Verifica
          le assegnazioni in anagrafica.
        </EmptyDataNote>
      ) : null}

      <div className="bg-scz-dark border border-white/10 rounded-2xl p-4 flex gap-2 flex-wrap">
        {(
          [
            ["turnover", "Turnover"],
            ["daily", "Giornaliero"],
            ["top", "Top Items"],
            ["staff", "Staff"],
            ["cassa", "Cassa"],
            ["agenda", "Agenda"],
            ["clienti", "Clienti"],
            ["servizi", "Servizi"],
            ["prodotti", "Prodotti"],
            ["whatsapp_reminders", "WhatsApp"],
          ] as Array<[ReportTabKey, string]>
        ).map(([k, label]) => (
          <a
            key={k}
            href={`?${new URLSearchParams({ ...baseParams, tab: k }).toString()}`}
            className={`px-4 py-2 rounded-xl font-bold border ${
              tab === k ? "bg-scz-medium border-white/20" : "bg-black/20 border-white/10"
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {/* === VENDITE: hero + KPI + confronto + filtri attivi === */}
      {needSales && (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white md:text-2xl">
              Vendite & Turnover
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Console direzionale · KPI e confronto periodo
            </p>
          </div>

          {/* Filtri attivi (chips) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-bold text-white/80">
              Periodo: {dateFrom} → {dateTo}
            </span>
            {staffId != null && (
              <span className="rounded-full border border-scz-gold/30 bg-scz-gold/10 px-3 py-1.5 text-xs font-bold text-scz-gold">
                Staff: {staffOptions.find((s) => s.id === staffId)?.name ?? `#${staffId}`}
              </span>
            )}
            {paymentMethod && (
              <span className="rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-bold text-white/80">
                Pagamento: {paymentMethod === "cash" ? "Contanti" : "Carta"}
              </span>
            )}
            {itemType && (
              <span className="rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-bold text-white/80">
                Tipo: {itemType === "service" ? "Servizi" : "Prodotti"}
              </span>
            )}
          </div>

          <ReportKpiRow totals={totals} />
          <ReportPeriodComparison current={totals} previous={previousTotals} />

          {tab === "turnover" && <ReportRowsTable rows={(rows ?? []).slice(0, 400)} />}
          {tab === "daily" && <ReportDailyTable rows={daily ?? []} />}
          {tab === "top" && <ReportTopItemsTable rows={topItems ?? []} />}
          {tab === "staff" && <ReportStaffPerformanceTable rows={staffPerformance ?? []} />}
        </section>
      )}

      {/* === CASSA === */}
      {tab === "cassa" && salonId > 0 && (
        <>
          <ReportCashKpiRow totals={cashReport.totals as any} />
          <ReportCashSessionsTable rows={cashReport.sessions as any} />
        </>
      )}

      {/* === AGENDA === */}
      {tab === "agenda" && salonId > 0 && (
        <>
          <ReportAgendaKpiRow totals={agendaReport.totals as any} />
          <ReportAgendaNoShowTable rows={agendaReport.daily as any} />
          <ReportAgendaStaffUtilizationTable rows={agendaReport.staffUtilization as any} />
        </>
      )}

      {/* === CLIENTI === */}
      {tab === "clienti" && salonId > 0 && (
        <>
          <ReportClientsKpiRow totals={clientsReport.totals as any} />
          <ReportClientsNewCustomersTable rows={clientsReport.newCustomers as any} />
          <ReportClientsTopSpendersTable rows={clientsReport.topSpenders as any} />
        </>
      )}

      {/* === SERVIZI === */}
      {tab === "servizi" && salonId > 0 && (
        <>
          <ReportServicesKpiRow
            totals={{
              services_qty: Number((servicesReport as any)?.totals?.services_qty ?? 0),
              services_gross: Number(
                (servicesReport as any)?.totals?.services_gross_total ??
                  (servicesReport as any)?.totals?.gross_total ??
                  0
              ),
              avg_service_price: Number(
                (servicesReport as any)?.totals?.avg_service_price ??
                  (servicesReport as any)?.totals?.services_avg_price ??
                  0
              ),
            }}
          />
          <ReportServicesTopTable rows={(servicesReport as any).topServices ?? []} />
        </>
      )}

      {/* === PRODOTTI === */}
      {tab === "prodotti" && salonId > 0 && (
        <>
          <ReportProductsKpiRow totals={productsReport.totals as any} />
          <ReportProductsTopTable rows={productsReport.topProducts as any} />
          <ReportProductsLowStockTable rows={productsReport.lowStock as any} />
        </>
      )}

      {/* === WHATSAPP REMINDER (solo lettura) === */}
      {tab === "whatsapp_reminders" && salonId ? (
        <ReportWhatsAppRemindersTable
          rows={waReminderLog.rows}
          totals={waReminderLog.totals}
        />
      ) : null}
    </div>
  );
}