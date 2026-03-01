// lib/reports/getCashSessionsReport.ts
import { createServerSupabase } from "@/lib/supabaseServer";

export type CashSessionsFilters = {
  salonId: number;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
};

function isoStart(d: string) {
  return `${d}T00:00:00`;
}

function isoEnd(d: string) {
  return `${d}T23:59:59.999`;
}

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getCashSessionsReport(filters: CashSessionsFilters) {
  const supabase = await createServerSupabase();

  const { salonId, dateFrom, dateTo } = filters;

  // 1) Cash sessions nel range (per opened_at)
  const { data: sessions, error: sessionsErr } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("salon_id", salonId)
    .gte("opened_at", isoStart(dateFrom))
    .lte("opened_at", isoEnd(dateTo))
    .order("opened_at", { ascending: false });

  if (sessionsErr) throw new Error(sessionsErr.message);

  const list = Array.isArray(sessions) ? sessions : [];

  // 2) Totali per sessione:
  // - se la tabella cash_sessions ha già i totali salvati, li usiamo
  // - altrimenti calcoliamo dai sales nel range opened_at..closed_at
  const out = [];

  for (const s of list as any[]) {
    const openedAt = String(s.opened_at ?? "");
    const closedAt = s.closed_at ? String(s.closed_at) : null;

    // prova a leggere totali già presenti (nomi comuni)
    const storedGross =
      n(s.total_gross ?? s.gross_total ?? s.gross ?? s.total_amount);

    const storedCash = n(s.total_cash ?? s.gross_cash ?? s.cash_total);
    const storedCard = n(s.total_card ?? s.gross_card ?? s.card_total);

    let gross = storedGross;
    let cash = storedCash;
    let card = storedCard;

    // se non ci sono totali salvati → calcolo da sales
    if (gross === 0 && cash === 0 && card === 0 && openedAt) {
      const start = openedAt;
      const end = closedAt ?? new Date().toISOString();

      const { data: sales, error: salesErr } = await supabase
        .from("sales")
        .select("total_amount, payment_method, date")
        .eq("salon_id", salonId)
        .gte("date", start)
        .lte("date", end);

      if (salesErr) throw new Error(salesErr.message);

      for (const row of (sales ?? []) as any[]) {
        const amt = n(row.total_amount);
        gross += amt;
        const pm = String(row.payment_method ?? "").toLowerCase();
        if (pm === "cash") cash += amt;
        if (pm === "card") card += amt;
      }
    }

    // differenze (se esistono campi)
    const declaredCash = n(s.declared_cash ?? s.cash_counted ?? s.counted_cash);
    const diffCash = declaredCash ? declaredCash - cash : n(s.cash_difference);

    out.push({
      id: s.id,
      salon_id: s.salon_id,
      opened_at: openedAt,
      closed_at: closedAt,
      opened_by: s.opened_by ?? s.opened_by_user_id ?? s.user_id ?? null,
      gross_total: gross,
      gross_cash: cash,
      gross_card: card,
      declared_cash: declaredCash,
      cash_difference: diffCash,
      status: closedAt ? "closed" : "open",
    });
  }

  // Totali periodo
  const totals = out.reduce(
    (acc: any, x: any) => {
      acc.sessions += 1;
      acc.gross_total += n(x.gross_total);
      acc.gross_cash += n(x.gross_cash);
      acc.gross_card += n(x.gross_card);
      return acc;
    },
    { sessions: 0, gross_total: 0, gross_cash: 0, gross_card: 0 }
  );

  return { sessions: out, totals };
}