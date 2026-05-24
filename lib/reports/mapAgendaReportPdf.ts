/** Soglia minima giorni con appuntamenti per mostrare ore prenotate per staff. */
export const AGENDA_PDF_MIN_STAFF_WORKING_DAYS = 1;

export type AgendaNoShowDayPdfRow = {
  day: string;
  appointments: number;
  done: number;
  no_show: number;
  cancelled: number;
};

export type AgendaStaffPdfRow = {
  staff_name: string;
  booked_hours: number;
  working_days: number;
};

export type AgendaReportPdfPayload = {
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  totals: {
    appointments: number;
    done: number;
    no_show: number;
    cancelled: number;
    missed: number;
    completion_rate: number;
  };
  noShowDays: AgendaNoShowDayPdfRow[];
  staffRows: AgendaStaffPdfRow[];
  showStaffSection: boolean;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function mapAgendaReportToPdfPayload(input: {
  salonName: string;
  salonId: number;
  dateFrom: string;
  dateTo: string;
  totals: {
    appointments?: number;
    done?: number;
    no_show?: number;
    cancelled?: number;
    in_sala?: number;
    completion_rate?: number;
  };
  daily: Array<{
    day?: string;
    appointments?: number;
    done?: number;
    no_show?: number;
    cancelled?: number;
  }>;
  staffUtilization: Array<{
    staff_name?: string;
    staff_id?: string;
    booked_hours?: number;
    working_days?: number;
    utilization_pct?: number;
  }>;
}): AgendaReportPdfPayload {
  const no_show = n(input.totals.no_show);

  const noShowDays = [...input.daily]
    .filter((d) => n(d.no_show) > 0)
    .sort((a, b) => n(b.no_show) - n(a.no_show) || String(a.day).localeCompare(String(b.day)))
    .slice(0, 20)
    .map((d) => ({
      day: String(d.day ?? "").slice(0, 10),
      appointments: n(d.appointments),
      done: n(d.done),
      no_show: n(d.no_show),
      cancelled: n(d.cancelled),
    }));

  const staffRows = input.staffUtilization
    .filter((s) => n(s.working_days) >= AGENDA_PDF_MIN_STAFF_WORKING_DAYS && n(s.booked_hours) > 0)
    .slice(0, 15)
    .map((s) => ({
      staff_name: String(s.staff_name ?? `Staff ${s.staff_id ?? ""}`).trim() || "—",
      booked_hours: Math.round(n(s.booked_hours) * 10) / 10,
      working_days: n(s.working_days),
    }));

  return {
    salonName: input.salonName,
    salonId: input.salonId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt: new Date().toLocaleString("it-IT"),
    totals: {
      appointments: n(input.totals.appointments),
      done: n(input.totals.done),
      no_show,
      cancelled: n(input.totals.cancelled),
      missed: no_show,
      completion_rate: Math.round(n(input.totals.completion_rate) * 10) / 10,
    },
    noShowDays,
    staffRows,
    showStaffSection: staffRows.length > 0,
  };
}
