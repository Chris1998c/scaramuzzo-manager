export type FiscalTodayCounts = {
  by_status: Record<string, number>;
  total: number;
};

export type CashSessionFiscalRow = {
  id: number;
  session_date: string;
  printer_enabled: boolean;
  opened_at: string | null;
  status: string | null;
};

export type FiscalSettingsSnapshot = {
  salonId: number;
  salonName: string | null;
  bridge: { ok: true } | { ok: false; error: string };
  session: CashSessionFiscalRow | null;
  fiscalToday: FiscalTodayCounts;
};
