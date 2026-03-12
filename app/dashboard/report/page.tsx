// app/dashboard/report/page.tsx

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { getSalonTurnoverAnalytics } from "@/lib/reports/getSalonTurnoverAnalytics";
import { getCashSessionsReport } from "@/lib/reports/getCashSessionsReport";
import { getAgendaReport } from "@/lib/reports/getAgendaReport";
import { getClientsReport } from "@/lib/reports/getClientsReport";
import { getServicesReport } from "@/lib/reports/getServicesReport";
import { getProductsReport } from "@/lib/reports/getProductsReport";

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

function roleFromMetadata(user: any): string | null {
  const r = String(user?.user_metadata?.role ?? user?.app_metadata?.role ?? "").trim();
  return r ? r : null;
}

function normalizeRole(r: string | null) {
  return (r ?? "").trim().toLowerCase();
}

type TabKey =
  | "turnover"
  | "daily"
  | "top"
  | "staff"
  | "cassa"
  | "agenda"
  | "clienti"
  | "servizi"
  | "prodotti";

type ReportPageSearchParams = Record<string, string | string[] | undefined>;

type ReportPageProps = {
  searchParams?: Promise<ReportPageSearchParams>;
};

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const sp = (await searchParams) ?? {};

  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const user = authData.user;
  const userId = user.id;

  const { data: roleRow } = await supabaseAdmin
    .from("users")
    .select("roles:roles(name)")
    .eq("id", userId)
    .maybeSingle();

  const dbRole = (roleRow as any)?.roles?.[0]?.name ?? null;
  const role = normalizeRole(dbRole || roleFromMetadata(user));
  if (role !== "coordinator") redirect("/dashboard");

  const salonId = toInt(sp.salon_id as string | undefined) ?? 0;
  const dateFrom = (sp.date_from as string | undefined) ?? startOfMonthISO();
  const dateTo = (sp.date_to as string | undefined) ?? todayISO();
  const staffId = toInt(sp.staff_id as string | undefined);
  const paymentMethod = (sp.payment_method as string | undefined) ?? null;
  const itemType = (sp.item_type as string | undefined) ?? null;

  const tab = ((sp.tab as string | undefined) ?? "turnover") as TabKey;

  // Staff dropdown (serve sempre)
  const { data: staffRows } = salonId
    ? await supabaseAdmin
        .from("staff")
        .select("id, name")
        .eq("salon_id", salonId)
        .order("name", { ascending: true })
    : { data: [] as any[] };

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

  const { totals, rows, daily, topItems, staffPerformance, previousTotals } = salesAnalytics;

  return (
    <div className="space-y-6">
      <ReportSalonSync />

      <ReportFilters
        salonId={salonId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        staffId={staffId}
        paymentMethod={paymentMethod}
        itemType={itemType}
        staffOptions={staffOptions}
      />

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
          ] as Array<[TabKey, string]>
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
      {tab === "cassa" && (
        <>
          <ReportCashKpiRow totals={cashReport.totals as any} />
          <ReportCashSessionsTable rows={cashReport.sessions as any} />
        </>
      )}

      {/* === AGENDA === */}
      {tab === "agenda" && (
        <>
          <ReportAgendaKpiRow totals={agendaReport.totals as any} />
          <ReportAgendaNoShowTable rows={agendaReport.daily as any} />
          <ReportAgendaStaffUtilizationTable rows={agendaReport.staffUtilization as any} />
        </>
      )}

      {/* === CLIENTI === */}
      {tab === "clienti" && (
        <>
          <ReportClientsKpiRow totals={clientsReport.totals as any} />
          <ReportClientsNewCustomersTable rows={clientsReport.newCustomers as any} />
          <ReportClientsTopSpendersTable rows={clientsReport.topSpenders as any} />
        </>
      )}

      {/* === SERVIZI === */}
      {tab === "servizi" && (
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
      {tab === "prodotti" && (
        <>
          <ReportProductsKpiRow totals={productsReport.totals as any} />
          <ReportProductsTopTable rows={productsReport.topProducts as any} />
          <ReportProductsLowStockTable rows={productsReport.lowStock as any} />
        </>
      )}
    </div>
  );
}