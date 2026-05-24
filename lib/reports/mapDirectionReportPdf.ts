import type { DirectionReport } from "@/lib/reports/getDirectionReport";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";
import { CRM_CATEGORY_LABELS } from "@/lib/reports/getDirectionAlerts";
import { discountPercent } from "@/lib/reports/reportLineKpiMath";

export type DirectionPdfPayload = {
  salonName: string;
  generatedAt: string;
  todayLabel: string;
  monthLabel: string;
  incassoOggi: number;
  listinoOggi: number;
  vsIeriPct: number | null;
  vsIeriAmount: number;
  vsSettimanaPct: number | null;
  vsSettimanaAmount: number;
  meseCorrente: number;
  meseListino: number;
  meseSconti: number;
  meseScontrini: number;
  meseClienti: number;
  meseTicketMedio: number;
  meseVsPrecPct: number | null;
  scontriniOggi: number;
  clientiOggi: number;
  scontiOggi: number;
  scontoPctOggi: number;
  retailPctOggi: number | null;
  ticketMedioOggi: number;
  topStaff: Array<{ name: string; incassato: number; scontoPct: number; retailPct: number | null }>;
  recallCount: number;
  colorAbsentCount: number;
  recallClients: Array<{ name: string; detail: string }>;
  crmActions: Array<{ name: string; reason: string; detail: string }>;
  alerts: Array<{ title: string; count: number; detail: string; severity: string }>;
};

function money(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function pct(n: number | null): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function mapDirectionReportToPdfPayload(
  report: DirectionReport,
  salonName: string,
): DirectionPdfPayload {
  const today = report.today.money.gross;
  const month = report.month.money.gross;
  const discountPct = discountPercent(today.full, today.discount);

  const topStaff = [...report.staffToday]
    .sort((a, b) => b.gross.real - a.gross.real)
    .slice(0, 5)
    .map((s) => ({
      name: s.staff_name,
      incassato: s.gross.real,
      scontoPct: s.gross.discount_pct,
      retailPct: s.retail_penetration_pct,
    }));

  let served = 0;
  let withRetail = 0;
  for (const s of report.staffToday) {
    served += s.customers_served;
    withRetail += s.customers_with_retail;
  }
  const retailPct = served > 0 ? Math.round((withRetail / served) * 1000) / 10 : null;

  return {
    salonName,
    generatedAt: new Date().toLocaleString("it-IT"),
    todayLabel: report.today.dateFrom,
    monthLabel: `${report.month.dateFrom} → ${report.month.dateTo}`,
    incassoOggi: today.real,
    listinoOggi: today.full,
    vsIeriPct: report.vsYesterday.pct_gross,
    vsIeriAmount: report.vsYesterday.amount_gross,
    vsSettimanaPct: report.vsLastWeekSameDay.pct_gross,
    vsSettimanaAmount: report.vsLastWeekSameDay.amount_gross,
    meseCorrente: month.real,
    meseListino: report.month.money.gross.full,
    meseSconti: report.month.money.gross.discount,
    meseScontrini: report.month.receipts_count,
    meseClienti: report.month.customers_count,
    meseTicketMedio: report.month.avg_ticket_gross,
    meseVsPrecPct: report.monthComparison.gross_real_pct,
    scontriniOggi: report.today.receipts_count,
    clientiOggi: report.today.customers_count,
    scontiOggi: today.discount,
    scontoPctOggi: discountPct,
    retailPctOggi: retailPct,
    ticketMedioOggi: report.today.avg_ticket_gross,
    topStaff,
    recallCount: report.crm.notReturned60.length,
    colorAbsentCount: report.crm.colorAbsent.length,
    recallClients: report.crm.notReturned60.slice(0, 8).map((c) => ({
      name: c.customer_name,
      detail: c.detail,
    })),
    crmActions: report.crmActions.map((a) => ({
      name: a.customer_name,
      reason: CRM_CATEGORY_LABELS[a.category],
      detail: a.detail,
    })),
    alerts: report.alerts.map((a) => ({
      title: a.title,
      count: a.count,
      detail: a.detail,
      severity: a.severity,
    })),
  };
}

export { money as formatPdfMoney, pct as formatPdfPct, formatRetailPenetrationPct };
