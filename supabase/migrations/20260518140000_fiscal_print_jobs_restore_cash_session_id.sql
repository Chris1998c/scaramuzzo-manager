-- Ripristina fiscal_print_jobs.cash_session_id (rimossa da remote_schema drift).
-- Necessario per close_cash_session_atomic e close-session API.

BEGIN;

ALTER TABLE public.fiscal_print_jobs
  ADD COLUMN IF NOT EXISTS cash_session_id bigint NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fiscal_print_jobs_cash_session_id_fkey'
      AND conrelid = 'public.fiscal_print_jobs'::regclass
  ) THEN
    ALTER TABLE public.fiscal_print_jobs
      ADD CONSTRAINT fiscal_print_jobs_cash_session_id_fkey
      FOREIGN KEY (cash_session_id)
      REFERENCES public.cash_sessions (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS fiscal_print_jobs_cash_session_id_idx
  ON public.fiscal_print_jobs (cash_session_id)
  WHERE cash_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_print_jobs_z_report_cash_session_unique
  ON public.fiscal_print_jobs (cash_session_id)
  WHERE kind = 'z_report' AND cash_session_id IS NOT NULL;

-- Backfill leggero: job collegati a vendita → sessione cassa della vendita.
UPDATE public.fiscal_print_jobs j
SET cash_session_id = s.cash_session_id
FROM public.sales s
WHERE j.sale_id = s.id
  AND j.cash_session_id IS NULL
  AND s.cash_session_id IS NOT NULL;

COMMIT;
