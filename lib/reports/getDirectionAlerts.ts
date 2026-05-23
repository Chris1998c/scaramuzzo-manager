import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import type { DirectionCrmActions } from "@/lib/reports/getDirectionCrmActions";
import { COLOR_ABSENT_ALERT_MIN } from "@/lib/reports/colorAbsentSegment";
import {
  computeStaffAlertBadges,
  computeTeamAvgTicket,
  HIGH_DISCOUNT_PCT,
} from "@/lib/reports/staffKpiAlerts";
import { computeRetailPenetration } from "@/lib/reports/retailPenetration";
const MAX_ALERTS = 5;
const HIGH_DISCOUNT_DAY_PCT = 12;
const LOW_RETAIL_DAY_PCT = 25;
const LOW_STOCK_WARN = 3;
const HIGH_NO_SHOW_TODAY = 2;
const HIGH_NO_SHOW_WEEK = 5;
const OPEN_CASH_WARN_HOURS = 8;

export type DirectionAlert = {
  id: string;
  title: string;
  count: number;
  detail: string;
  href: string;
  severity: "warning" | "info";
};

type AlertCandidate = DirectionAlert & { priority: number };

export function buildDirectionAlerts(input: {
  staffToday: StaffKpiRow[];
  noShowToday: number;
  noShowWeek: number;
  appointmentsToday: number;
  crm: DirectionCrmActions;
  salonId: number;
  todayDiscountPct: number;
  todayRetailPenetrationPct: number | null;
  openCashHours: number | null;
  lowStockCount: number;
  colorAbsentCount: number;
}): DirectionAlert[] {
  const candidates: AlertCandidate[] = [];
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ salon_id: String(input.salonId), ...extra });
    return `/dashboard/report?${p.toString()}`;
  };

  const push = (alert: DirectionAlert, priority: number) => {
    candidates.push({ ...alert, priority });
  };

  if (input.openCashHours != null && input.openCashHours >= OPEN_CASH_WARN_HOURS) {
    push(
      {
        id: "cash-open",
        title: "Cassa aperta da ore",
        count: 1,
        detail: `Sessione aperta da ${Math.floor(input.openCashHours)} ore — verifica chiusura`,
        href: q({ tab: "cassa_audit", subtab: "cassa" }),
        severity: "warning",
      },
      100,
    );
  }

  if (input.noShowToday >= HIGH_NO_SHOW_TODAY) {
    push(
      {
        id: "noshow-today-high",
        title: "No-show alti oggi",
        count: input.noShowToday,
        detail: "Più clienti del solito non si sono presentati",
        href: q({ tab: "cassa_audit", subtab: "agenda" }),
        severity: "warning",
      },
      95,
    );
  } else if (input.noShowToday > 0) {
    push(
      {
        id: "noshow-today",
        title: "No-show oggi",
        count: input.noShowToday,
        detail: "Appuntamenti segnati come no-show oggi",
        href: q({ tab: "cassa_audit", subtab: "agenda" }),
        severity: "warning",
      },
      70,
    );
  } else if (input.noShowWeek >= HIGH_NO_SHOW_WEEK) {
    push(
      {
        id: "noshow-week",
        title: "No-show in settimana",
        count: input.noShowWeek,
        detail: "Controlla chi non si è presentato",
        href: q({ tab: "cassa_audit", subtab: "agenda" }),
        severity: "info",
      },
      55,
    );
  }

  if (input.todayDiscountPct >= HIGH_DISCOUNT_DAY_PCT) {
    push(
      {
        id: "discount-day",
        title: "Troppi sconti oggi",
        count: 1,
        detail: `Sconto medio ${input.todayDiscountPct.toFixed(0)}% sul listino — controlla il team`,
        href: q({ tab: "team" }),
        severity: "warning",
      },
      88,
    );
  }

  const highDiscount = input.staffToday.filter((s) => s.gross.discount_pct >= HIGH_DISCOUNT_PCT);
  if (highDiscount.length > 0) {
    const top = highDiscount.sort((a, b) => b.gross.discount_pct - a.gross.discount_pct)[0];
    push(
      {
        id: "staff-discount",
        title: "Sconti alti in team",
        count: highDiscount.length,
        detail: `${top.staff_name} al ${top.gross.discount_pct.toFixed(0)}% — verifica se giustificato`,
        href: q({ tab: "team" }),
        severity: "warning",
      },
      82,
    );
  }

  if (input.colorAbsentCount >= COLOR_ABSENT_ALERT_MIN) {
    push(
      {
        id: "color-absent",
        title: "Clienti colore assenti",
        count: input.colorAbsentCount,
        detail: "Schede colore attive ma nessun appuntamento colore in tempo",
        href: q({ tab: "clienti" }),
        severity: "info",
      },
      78,
    );
  }

  if (
    input.todayRetailPenetrationPct != null &&
    input.todayRetailPenetrationPct < LOW_RETAIL_DAY_PCT &&
    input.staffToday.some((s) => s.services_qty >= 2)
  ) {
    push(
      {
        id: "retail-day",
        title: "Retail basso oggi",
        count: 1,
        detail: `Solo ${input.todayRetailPenetrationPct.toFixed(0)}% clienti con prodotti oggi`,
        href: q({ tab: "team" }),
        severity: "info",
      },
      72,
    );
  }

  const teamAvg = computeTeamAvgTicket(input.staffToday);
  const lowTicketStaff = input.staffToday.filter(
    (s) => computeStaffAlertBadges(s, teamAvg).includes("low_ticket"),
  );
  if (lowTicketStaff.length > 0) {
    const top = lowTicketStaff[0];
    push(
      {
        id: "low-ticket",
        title: "Scontrino basso in team",
        count: lowTicketStaff.length,
        detail: `${top.staff_name} sotto la media — controlla mix servizi`,
        href: q({ tab: "team" }),
        severity: "info",
      },
      68,
    );
  }

  const retailLow = input.staffToday.filter(
    (s) => s.gross.real > 0 && s.gross.retail === 0 && s.services_qty >= 2,
  );
  if (retailLow.length > 0) {
    push(
      {
        id: "retail-team",
        title: "Zero retail in team",
        count: retailLow.length,
        detail: "Collaboratori con servizi ma nessun prodotto venduto oggi",
        href: q({ tab: "team" }),
        severity: "info",
      },
      65,
    );
  }

  if (input.lowStockCount >= LOW_STOCK_WARN) {
    push(
      {
        id: "low-stock",
        title: "Prodotti critici",
        count: input.lowStockCount,
        detail: "Prodotti sotto soglia magazzino",
        href: q({ tab: "vendite", subtab: "prodotti" }),
        severity: "warning",
      },
      62,
    );
  }

  const recallCount = input.crm.notReturned60.length;
  if (recallCount > 0) {
    push(
      {
        id: "recall-60",
        title: "Clienti da richiamare",
        count: recallCount,
        detail: "Non tornano da almeno 60 giorni",
        href: q({ tab: "clienti" }),
        severity: "info",
      },
      50,
    );
  }

  const noRetail = input.crm.noRetailBuyers.length;
  if (noRetail > 0) {
    push(
      {
        id: "no-retail",
        title: "Clienti senza prodotti",
        count: noRetail,
        detail: "Visite in salone ma nessun acquisto retail",
        href: q({ tab: "clienti" }),
        severity: "info",
      },
      48,
    );
  }

  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_ALERTS)
    .map(({ priority: _p, ...alert }) => alert);
}

/** Retail penetration oggi da righe staff. */
export function computeTodayRetailPenetration(staffToday: StaffKpiRow[]): number | null {
  let served = 0;
  let withRetail = 0;
  for (const s of staffToday) {
    served += s.customers_served;
    withRetail += s.customers_with_retail;
  }
  return computeRetailPenetration(served, withRetail).retail_penetration_pct;
}

/** Priorità azioni CRM: max 5 clienti totali. */
export type CrmActionItem = {
  customer_id: string;
  customer_name: string;
  reason: string;
  detail: string;
  gross_total?: number;
  phone?: string | null;
  whatsapp_ready: boolean;
  category: "recall" | "top" | "noshow" | "no_retail" | "color_absent";
};

export function pickCrmActionQueue(crm: DirectionCrmActions, limit = 5): CrmActionItem[] {
  const queue: CrmActionItem[] = [];

  const push = (
    items: Array<{
      customer_id: string;
      customer_name: string;
      detail: string;
      gross_total?: number;
      phone?: string | null;
      whatsapp_ready?: boolean;
    }>,
    category: CrmActionItem["category"],
    reason: string,
  ) => {
    for (const c of items) {
      if (queue.length >= limit) return;
      queue.push({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        reason,
        detail: c.detail,
        gross_total: c.gross_total,
        phone: c.phone,
        whatsapp_ready: Boolean(c.phone?.trim()),
        category,
      });
    }
  };

  push(crm.colorAbsent.slice(0, 1), "color_absent", "Colore assente");
  push(crm.notReturned60.slice(0, 2), "recall", "Da richiamare");
  push(crm.noShowCustomers.slice(0, 1), "noshow", "No-show");
  push(crm.noRetailBuyers.slice(0, 1), "no_retail", "Senza prodotti");
  push(crm.topSpenders.slice(0, 1), "top", "Miglior cliente");

  return queue.slice(0, limit);
}

export const CRM_CATEGORY_LABELS: Record<CrmActionItem["category"], string> = {
  recall: "Da richiamare",
  top: "Migliori clienti",
  noshow: "No-show",
  no_retail: "Senza prodotti",
  color_absent: "Colore assente",
};
