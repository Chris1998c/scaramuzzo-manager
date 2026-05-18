-- Ripristina completed_at (drift remote_schema) e corregge unique sale_id troppo largo.

BEGIN;

ALTER TABLE public.fiscal_print_jobs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

COMMENT ON COLUMN public.fiscal_print_jobs.completed_at IS
  'Timestamp completamento job (success o failed definitivo); usato da finalize/requeue.';

-- Blocca due sale_receipt per la stessa vendita, ma consente void_receipt (e altri kind) sullo stesso sale_id.
DROP INDEX IF EXISTS public.fiscal_print_jobs_sale_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_print_jobs_sale_receipt_sale_id_unique
  ON public.fiscal_print_jobs (sale_id)
  WHERE kind = 'sale_receipt' AND sale_id IS NOT NULL;

COMMIT;
