BEGIN;

ALTER TABLE public.fiscal_print_jobs
  ADD COLUMN IF NOT EXISTS cash_session_id bigint NULL REFERENCES public.cash_sessions(id);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_print_jobs_z_report_cash_session_unique
  ON public.fiscal_print_jobs (cash_session_id)
  WHERE kind = 'z_report' AND cash_session_id IS NOT NULL;

COMMIT;
