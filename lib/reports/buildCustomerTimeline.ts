export type TimelineEntryKind =
  | "appointment"
  | "service"
  | "product"
  | "noshow"
  | "spesa";

export type TimelineEntry = {
  id: string;
  kind: TimelineEntryKind;
  date: string;
  title: string;
  detail?: string;
  amount?: number;
};

export type CustomerTimelineInput = {
  appointments: Array<{
    id: number | string;
    start_time?: string | null;
    status?: string | null;
    service_label?: string | null;
  }>;
  saleItems: Array<{
    id?: number | string;
    sale_id?: number | string;
    service_id?: number | string | null;
    product_id?: number | string | null;
    quantity?: number | null;
    price?: number | null;
    sale_date?: string | null;
    label?: string | null;
  }>;
  sales: Array<{
    id: number | string;
    date?: string | null;
    total_amount?: number | null;
  }>;
};

function normStatus(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase();
}

export function buildCustomerTimeline(
  input: CustomerTimelineInput,
  limit = 12,
): { entries: TimelineEntry[]; total_spent: number } {
  const entries: TimelineEntry[] = [];
  let totalSpent = 0;

  for (const s of input.sales) {
    const amt = Number(s.total_amount ?? 0);
    if (Number.isFinite(amt)) totalSpent += amt;
    const date = String(s.date ?? "").slice(0, 10);
    if (!date) continue;
    entries.push({
      id: `sale-${s.id}`,
      kind: "spesa",
      date,
      title: "Spesa in salone",
      amount: Number.isFinite(amt) ? amt : 0,
    });
  }

  for (const a of input.appointments) {
    const date = String(a.start_time ?? "").slice(0, 10);
    if (!date) continue;
    const status = normStatus(a.status);
  const isNoShow = status === "no_show" || status === "noshow";
    entries.push({
      id: `appt-${a.id}`,
      kind: isNoShow ? "noshow" : "appointment",
      date,
      title: isNoShow ? "No-show" : "Appuntamento",
      detail: a.service_label?.trim() || undefined,
    });
  }

  for (const it of input.saleItems) {
    const date = String(it.sale_date ?? "").slice(0, 10);
    if (!date) continue;
    const isProduct = it.product_id != null;
    const qty = Number(it.quantity ?? 1) || 1;
    const price = Number(it.price ?? 0) || 0;
    entries.push({
      id: `item-${it.id ?? `${it.sale_id}-${isProduct ? "p" : "s"}`}`,
      kind: isProduct ? "product" : "service",
      date,
      title: isProduct ? "Prodotto acquistato" : "Servizio",
      detail: it.label?.trim() || undefined,
      amount: price * qty,
    });
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    entries: entries.slice(0, limit),
    total_spent: Math.round(totalSpent * 100) / 100,
  };
}
