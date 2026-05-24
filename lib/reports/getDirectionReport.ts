import { getSalonTurnover } from "@/lib/reports/getSalonTurnover";
import { buildStaffKpiFromRows, type StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import { getAgendaReport } from "@/lib/reports/getAgendaReport";
import {
  aggregateMoneyTriples,
  avgTicket,
  pctChange,
  roundMoney,
  type MoneyTriple,
  type ReportLineInput,
} from "@/lib/reports/reportLineKpiMath";
import { fetchCustomerIdsForRows } from "@/lib/reports/reportSaleCustomers";
import {
  getDirectionCrmActions,
  type DirectionCrmActions,
} from "@/lib/reports/getDirectionCrmActions";
import {
  buildDirectionAlerts,
  computeTodayRetailPenetration,
  pickCrmActionQueue,
  type CrmActionItem,
  type DirectionAlert,
} from "@/lib/reports/getDirectionAlerts";
import { getColorAbsentCustomers } from "@/lib/reports/getColorAbsentCustomers";
import {
  getOpenCashSessionHours,
  getSalonLowStockCount,
} from "@/lib/reports/getSalonOperationalSignals";
import { discountPercent } from "@/lib/reports/reportLineKpiMath";
import {
  sameWeekdayLastWeek,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
  yesterdayISO,
} from "@/lib/reports/reportPeriodCompare";

function shiftPeriod(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const diff = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diff);
  return {
    prevFrom: prevFrom.toISOString().slice(0, 10),
    prevTo: prevTo.toISOString().slice(0, 10),
  };
}

function toLineInput(r: {
  price: number;
  quantity: number;
  item_discount: number;
  line_total_gross: number;
  line_net: number;
  line_vat?: number;
  vat_rate?: number | null;
}): ReportLineInput {
  return {
    price: r.price,
    quantity: r.quantity,
    item_discount: r.item_discount,
    line_total_gross: r.line_total_gross,
    line_net: r.line_net,
    line_vat: r.line_vat,
    vat_rate: r.vat_rate,
  };
}

export type PeriodSnapshot = {
  dateFrom: string;
  dateTo: string;
  receipts_count: number;
  customers_count: number;
  services_qty: number;
  products_qty: number;
  money: { gross: MoneyTriple; net: MoneyTriple };
  avg_ticket_gross: number;
  avg_ticket_net: number;
};

export type DayCompare = {
  amount_gross: number;
  amount_net: number;
  pct_gross: number | null;
  pct_net: number | null;
};

export type DirectionReport = {
  today: PeriodSnapshot;
  month: PeriodSnapshot;
  monthComparison: {
    gross_real_pct: number | null;
    net_real_pct: number | null;
    receipts_pct: number | null;
  };
  vsYesterday: DayCompare;
  vsLastWeekSameDay: DayCompare;
  crm: DirectionCrmActions;
  crmActions: CrmActionItem[];
  alerts: DirectionAlert[];
  staffToday: StaffKpiRow[];
};

function buildSnapshot(
  dateFrom: string,
  dateTo: string,
  totals: { receipts_count?: number },
  rows: Array<{
    price: number;
    quantity: number;
    item_discount: number;
    line_total_gross: number;
    line_net: number;
    line_vat?: number;
    vat_rate?: number | null;
    item_type?: string | null;
    sale_id?: number | string | null;
  }>,
  customerBySale: Map<number, string>,
): PeriodSnapshot {
  const lines = rows.map(toLineInput);
  const money = aggregateMoneyTriples(lines);

  const customers = new Set<string>();
  let services_qty = 0;
  let products_qty = 0;

  for (const r of rows) {
    const saleId = Number(r.sale_id);
    if (Number.isFinite(saleId) && saleId > 0) {
      const cid = customerBySale.get(saleId);
      if (cid) customers.add(cid);
    }
    const qty = Number(r.quantity) || 1;
    if (r.item_type === "service") services_qty += qty;
    if (r.item_type === "product") products_qty += qty;
  }

  const receipts = Number(totals.receipts_count ?? 0);

  return {
    dateFrom,
    dateTo,
    receipts_count: receipts,
    customers_count: customers.size,
    services_qty,
    products_qty,
    money,
    avg_ticket_gross: avgTicket(money.gross.real, receipts),
    avg_ticket_net: avgTicket(money.net.real, receipts),
  };
}


/** Riepilogo: più snapshot turnover in parallelo; resta fan-out CRM/operativo separato. */
export async function getDirectionReport(salonId: number): Promise<DirectionReport> {
  const todayIso = todayISO();
  const monthStart = startOfMonthISO();
  const yesterday = yesterdayISO(todayIso);
  const lastWeekSame = sameWeekdayLastWeek(todayIso);
  const weekStart = startOfWeekISO(todayIso);

  const crmBase = await getDirectionCrmActions(salonId);
  const [colorAbsent, openCashHours, lowStockCount] = await Promise.all([
    getColorAbsentCustomers(salonId),
    getOpenCashSessionHours(salonId),
    getSalonLowStockCount(salonId),
  ]);
  const crm = { ...crmBase, colorAbsent };

  const { prevFrom, prevTo } = shiftPeriod(monthStart, todayIso);

  const [
    todayTurnover,
    monthTurnover,
    yesterdayTurnover,
    lastWeekTurnover,
    prevMonthTurnover,
    agendaToday,
    agendaWeek,
  ] = await Promise.all([
    getSalonTurnover({ salonId, dateFrom: todayIso, dateTo: todayIso }),
    getSalonTurnover({ salonId, dateFrom: monthStart, dateTo: todayIso }),
    getSalonTurnover({ salonId, dateFrom: yesterday, dateTo: yesterday }),
    getSalonTurnover({ salonId, dateFrom: lastWeekSame, dateTo: lastWeekSame }),
    getSalonTurnover({ salonId, dateFrom: prevFrom, dateTo: prevTo }),
    getAgendaReport({ salonId, dateFrom: todayIso, dateTo: todayIso }),
    getAgendaReport({ salonId, dateFrom: weekStart, dateTo: todayIso }),
  ]);

  const [todayCustomers, monthCustomers] = await Promise.all([
    fetchCustomerIdsForRows(todayTurnover.rows),
    fetchCustomerIdsForRows(monthTurnover.rows),
  ]);

  const todaySnap = buildSnapshot(
    todayIso,
    todayIso,
    todayTurnover.totals,
    todayTurnover.rows,
    todayCustomers,
  );

  const monthSnap = buildSnapshot(
    monthStart,
    todayIso,
    monthTurnover.totals,
    monthTurnover.rows,
    monthCustomers,
  );

  const yesterdayMoney = aggregateMoneyTriples(yesterdayTurnover.rows.map(toLineInput));
  const lastWeekMoney = aggregateMoneyTriples(lastWeekTurnover.rows.map(toLineInput));

  const prevMoney = aggregateMoneyTriples(prevMonthTurnover.rows.map(toLineInput));

  const staffToday = buildStaffKpiFromRows(todayTurnover.rows, todayCustomers);

  const todayDiscountPct = discountPercent(
    todaySnap.money.gross.full,
    todaySnap.money.gross.discount,
  );

  const alerts = buildDirectionAlerts({
    staffToday,
    noShowToday: agendaToday.totals.no_show,
    noShowWeek: agendaWeek.totals.no_show,
    appointmentsToday: agendaToday.totals.appointments,
    crm,
    salonId,
    todayDiscountPct,
    todayRetailPenetrationPct: computeTodayRetailPenetration(staffToday),
    openCashHours,
    lowStockCount,
    colorAbsentCount: colorAbsent.length,
  });

  return {
    today: todaySnap,
    month: monthSnap,
    monthComparison: {
      gross_real_pct: pctChange(monthSnap.money.gross.real, prevMoney.gross.real),
      net_real_pct: pctChange(monthSnap.money.net.real, prevMoney.net.real),
      receipts_pct: pctChange(
        monthSnap.receipts_count,
        Number(prevMonthTurnover.totals.receipts_count ?? 0),
      ),
    },
    vsYesterday: {
      amount_gross: yesterdayMoney.gross.real,
      amount_net: yesterdayMoney.net.real,
      pct_gross: pctChange(todaySnap.money.gross.real, yesterdayMoney.gross.real),
      pct_net: pctChange(todaySnap.money.net.real, yesterdayMoney.net.real),
    },
    vsLastWeekSameDay: {
      amount_gross: lastWeekMoney.gross.real,
      amount_net: lastWeekMoney.net.real,
      pct_gross: pctChange(todaySnap.money.gross.real, lastWeekMoney.gross.real),
      pct_net: pctChange(todaySnap.money.net.real, lastWeekMoney.net.real),
    },
    crm,
    crmActions: pickCrmActionQueue(crm, 5),
    alerts,
    staffToday,
  };
}

export function moneyDiff(triple: MoneyTriple): number {
  return roundMoney(triple.full - triple.real);
}
