export type CashSessionPdfRow = {
  session_label: string;
  status_label: string;
  opened_at: string;
  closed_at: string;
  gross_total: number;
  gross_cash: number;
  gross_card: number;
  declared_cash: number | null;
  cash_difference: number | null;
};

export type CashAnomalyPdfRow = {
  title: string;
  detail: string;
};

export type CashReportPdfPayload = {
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  totals: {
    sessions: number;
    gross_total: number;
    gross_cash: number;
    gross_card: number;
  };
  sessions: CashSessionPdfRow[];
  anomalies: CashAnomalyPdfRow[];
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtDt(iso: string | null | undefined): string {
  const s = String(iso ?? "").trim();
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 16);
}

function sessionLabel(sessionDate: string | null | undefined, openedAt: string): string {
  const d = String(sessionDate ?? "").trim();
  if (d) return d.slice(0, 10);
  return openedAt.slice(0, 10) || "—";
}

export function buildCashReportAnomalies(
  sessions: Array<{
    id?: unknown;
    status?: string;
    declared_cash?: number;
    cash_difference?: number;
  }>,
): CashAnomalyPdfRow[] {
  const out: CashAnomalyPdfRow[] = [];
  const openCount = sessions.filter((s) => String(s.status ?? "") === "open").length;
  if (openCount > 0) {
    out.push({
      title: "Sessioni ancora aperte",
      detail: `${openCount} sessione/i non chiuse nel periodo`,
    });
  }

  for (const s of sessions) {
    const declared = n(s.declared_cash);
    const diff = n(s.cash_difference);
    if (declared > 0 && Math.abs(diff) >= 0.01) {
      const id = s.id != null ? String(s.id) : "?";
      out.push({
        title: `Differenza contanti · sessione ${id}`,
        detail: `${diff >= 0 ? "+" : ""}${diff.toFixed(2).replace(".", ",")} € (dichiarati ${declared.toFixed(2).replace(".", ",")} €)`,
      });
    }
  }

  return out.slice(0, 10);
}

export function mapCashReportToPdfPayload(input: {
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  sessions: Array<{
    id?: unknown;
    session_date?: string | null;
    opened_at?: string;
    closed_at?: string | null;
    status?: string;
    gross_total?: number;
    gross_cash?: number;
    gross_card?: number;
    declared_cash?: number;
    cash_difference?: number;
  }>;
  totals: {
    sessions?: number;
    gross_total?: number;
    gross_cash?: number;
    gross_card?: number;
  };
}): CashReportPdfPayload {
  const sessions = input.sessions.map((s) => {
    const opened = String(s.opened_at ?? "");
    const declared = n(s.declared_cash);
    const diffRaw = s.cash_difference;
    const hasDeclared = declared > 0;
    const diff = hasDeclared ? n(diffRaw) : null;

    return {
      session_label: sessionLabel(s.session_date, opened),
      status_label: String(s.status ?? "") === "open" ? "Aperta" : "Chiusa",
      opened_at: fmtDt(opened),
      closed_at: fmtDt(s.closed_at ?? null),
      gross_total: n(s.gross_total),
      gross_cash: n(s.gross_cash),
      gross_card: n(s.gross_card),
      declared_cash: hasDeclared ? declared : null,
      cash_difference: diff,
    };
  });

  return {
    salonName: input.salonName,
    salonId: input.salonId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt: new Date().toLocaleString("it-IT"),
    totals: {
      sessions: n(input.totals.sessions),
      gross_total: n(input.totals.gross_total),
      gross_cash: n(input.totals.gross_cash),
      gross_card: n(input.totals.gross_card),
    },
    sessions,
    anomalies: buildCashReportAnomalies(input.sessions),
  };
}
