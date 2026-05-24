import type { DirectionReport } from "@/lib/reports/getDirectionReport";
import { pickStaffMoney } from "@/lib/reports/buildStaffKpiFromRows";
import { formatRetailPenetrationPct } from "@/lib/reports/retailPenetration";
import { discountPercent, type VatDisplayMode } from "@/lib/reports/reportLineKpiMath";
import { reportVatModeLabel } from "@/lib/reports/reportVatMode";

export type DirectionPdfPayload = {
  salonName: string;
  vatModeLabel: string;
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
  vatMode: VatDisplayMode = "gross",
): DirectionPdfPayload {
  const todayMoney = vatMode === "gross" ? report.today.money.gross : report.today.money.net;
  const monthMoney = vatMode === "gross" ? report.month.money.gross : report.month.money.net;
  const discountPct = discountPercent(todayMoney.full, todayMoney.discount);

  const vsIeriPct =
    vatMode === "gross" ? report.vsYesterday.pct_gross : report.vsYesterday.pct_net;
  const vsIeriAmount =
    vatMode === "gross" ? report.vsYesterday.amount_gross : report.vsYesterday.amount_net;
  const vsSettimanaPct =
    vatMode === "gross"
      ? report.vsLastWeekSameDay.pct_gross
      : report.vsLastWeekSameDay.pct_net;
  const vsSettimanaAmount =
    vatMode === "gross"
      ? report.vsLastWeekSameDay.amount_gross
      : report.vsLastWeekSameDay.amount_net;
  const meseVsPrecPct =
    vatMode === "gross"
      ? report.monthComparison.gross_real_pct
      : report.monthComparison.net_real_pct;

  const topStaff = [...report.staffToday]
    .sort((a, b) => pickStaffMoney(b, vatMode).real - pickStaffMoney(a, vatMode).real)
    .slice(0, 5)
    .map((s) => {
      const m = pickStaffMoney(s, vatMode);
      return {
        name: s.staff_name,
        incassato: m.real,
        scontoPct: m.discount_pct,
        retailPct: s.retail_penetration_pct,
      };
    });

  let served = 0;
  let withRetail = 0;
  for (const s of report.staffToday) {
    served += s.customers_served;
    withRetail += s.customers_with_retail;
  }
  const retailPct = served > 0 ? Math.round((withRetail / served) * 1000) / 10 : null;

  return {
    salonName,
    vatModeLabel: reportVatModeLabel(vatMode),
    generatedAt: new Date().toLocaleString("it-IT"),
    todayLabel: report.today.dateFrom,
    monthLabel: `${report.month.dateFrom} → ${report.month.dateTo}`,
    incassoOggi: todayMoney.real,
    listinoOggi: todayMoney.full,
    vsIeriPct,
    vsIeriAmount,
    vsSettimanaPct,
    vsSettimanaAmount,
    meseCorrente: monthMoney.real,
    meseListino: monthMoney.full,
    meseSconti: monthMoney.discount,
    meseScontrini: report.month.receipts_count,
    meseClienti: report.month.customers_count,
    meseTicketMedio:
      vatMode === "gross" ? report.month.avg_ticket_gross : report.month.avg_ticket_net,
    meseVsPrecPct,
    scontriniOggi: report.today.receipts_count,
    clientiOggi: report.today.customers_count,
    scontiOggi: todayMoney.discount,
    scontoPctOggi: discountPct,
    retailPctOggi: retailPct,
    ticketMedioOggi:
      vatMode === "gross" ? report.today.avg_ticket_gross : report.today.avg_ticket_net,
    topStaff,
    recallCount: report.crm.notReturned60.length,
    colorAbsentCount: report.crm.colorAbsent.length,
    recallClients: report.crm.notReturned60.slice(0, 8).map((c) => ({
      name: c.customer_name,
      detail: c.detail,
    })),
    crmActions: report.crmActions.map((a) => ({
      name: a.customer_name,
      reason:
        a.extra_reasons_count > 0
          ? `${a.reason} (+${a.extra_reasons_count} motivi)`
          : a.reason,
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
