-- Fiscal operational status on sales (fatturato invariato: tutte le sales restano nel totale)
alter table public.sales
  add column if not exists fiscal_status text not null default 'pending';

comment on column public.sales.fiscal_status is
  'Stato operativo fiscale/stampa: pending, queued, ecc. Non esclude la vendita dai report.';

-- Preferenza sessione cassa: stampante abilitata per la UI (default: stampa attiva)
alter table public.cash_sessions
  add column if not exists printer_enabled boolean not null default true;

comment on column public.cash_sessions.printer_enabled is
  'Se true, la cassa richiede stampa fiscale in chiusura (con check Print Bridge).';
