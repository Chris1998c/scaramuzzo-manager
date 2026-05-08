BEGIN;

ALTER TABLE public.fiscal_print_jobs
  ADD COLUMN IF NOT EXISTS sale_id bigint NULL REFERENCES public.sales(id);

UPDATE public.fiscal_print_jobs
SET sale_id = (payload ->> 'sale_id')::bigint
WHERE kind = 'sale_receipt'
  AND sale_id IS NULL
  AND (payload ->> 'sale_id') IS NOT NULL
  AND btrim(payload ->> 'sale_id') <> ''
  AND (payload ->> 'sale_id') ~ '^[0-9]+$';

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_print_jobs_sale_receipt_sale_id_unique
  ON public.fiscal_print_jobs (sale_id)
  WHERE kind = 'sale_receipt' AND sale_id IS NOT NULL;

COMMIT;
