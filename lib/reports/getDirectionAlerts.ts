import type { StaffKpiRow } from "@/lib/reports/buildStaffKpiFromRows";
import type { DirectionCrmActions } from "@/lib/reports/getDirectionCrmActions";

export type DirectionAlert = {
  id: string;
  title: string;
  count: number;
  detail: string;
  href: string;
  severity: "warning" | "info";
};

const HIGH_DISCOUNT_PCT = 15;
const MAX_ALERTS = 5;

export function buildDirectionAlerts(input: {
  staffToday: StaffKpiRow[];
  noShowToday: number;
  noShowWeek: number;
  crm: DirectionCrmActions;
  salonId: number;
}): DirectionAlert[] {
  const alerts: DirectionAlert[] = [];
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ salon_id: String(input.salonId), ...extra });
    return `/dashboard/report?${p.toString()}`;
  };

  const highDiscount = input.staffToday.filter((s) => s.gross.discount_pct >= HIGH_DISCOUNT_PCT);
  if (highDiscount.length > 0) {
    const top = highDiscount.sort((a, b) => b.gross.discount_pct - a.gross.discount_pct)[0];
    alerts.push({
      id: "staff-discount",
      title: "Sconti alti in team",
      count: highDiscount.length,
      detail: `${top.staff_name} al ${top.gross.discount_pct.toFixed(0)}% — controlla se è giustificato`,
      href: q({ tab: "team" }),
      severity: "warning",
    });
  }

  if (input.noShowToday > 0) {
    alerts.push({
      id: "noshow-today",
      title: "No-show oggi",
      count: input.noShowToday,
      detail: "Appuntamenti segnati come no-show oggi",
      href: q({ tab: "cassa_audit", subtab: "agenda" }),
      severity: "warning",
    });
  } else if (input.noShowWeek > 0) {
    alerts.push({
      id: "noshow-week",
      title: "No-show questa settimana",
      count: input.noShowWeek,
      detail: "Controlla chi non si è presentato",
      href: q({ tab: "cassa_audit", subtab: "agenda" }),
      severity: "info",
    });
  }

  const recallCount = input.crm.notReturned60.length;
  if (recallCount > 0) {
    alerts.push({
      id: "recall-60",
      title: "Clienti da richiamare",
      count: recallCount,
      detail: "Non tornano da almeno 60 giorni",
      href: q({ tab: "clienti" }),
      severity: "info",
    });
  }

  const noRetail = input.crm.noRetailBuyers.length;
  if (noRetail > 0) {
    alerts.push({
      id: "no-retail",
      title: "Clienti senza prodotti",
      count: noRetail,
      detail: "Visite in salone ma nessun acquisto retail",
      href: q({ tab: "clienti" }),
      severity: "info",
    });
  }

  const retailLow = input.staffToday.filter(
    (s) => s.gross.real > 0 && s.gross.retail === 0 && s.services_qty >= 2,
  );
  if (retailLow.length > 0 && alerts.length < MAX_ALERTS) {
    alerts.push({
      id: "retail-team",
      title: "Retail basso in team",
      count: retailLow.length,
      detail: "Collaboratori con servizi ma zero prodotti venduti oggi",
      href: q({ tab: "team" }),
      severity: "info",
    });
  }

  return alerts.slice(0, MAX_ALERTS);
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
  category: "recall" | "top" | "noshow" | "no_retail";
};

export function pickCrmActionQueue(crm: DirectionCrmActions, limit = 5): CrmActionItem[] {
  const queue: CrmActionItem[] = [];

  const push = (items: typeof crm.notReturned60, category: CrmActionItem["category"], reason: string) => {
    for (const c of items) {
      if (queue.length >= limit) return;
      queue.push({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        reason,
        detail: c.detail,
        gross_total: c.gross_total,
        phone: c.phone,
        whatsapp_ready: Boolean(c.whatsapp_ready),
        category,
      });
    }
  };

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
};
