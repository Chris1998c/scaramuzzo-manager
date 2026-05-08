BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'c'
      AND c.conname = 'sales_fiscal_status_check'
      AND n.nspname = 'public'
      AND r.relname = 'sales'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_fiscal_status_check
      CHECK (fiscal_status IN ('pending', 'queued', 'printed', 'error', 'not_required'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'c'
      AND c.conname = 'fiscal_print_jobs_status_check'
      AND n.nspname = 'public'
      AND r.relname = 'fiscal_print_jobs'
  ) THEN
    ALTER TABLE public.fiscal_print_jobs
      ADD CONSTRAINT fiscal_print_jobs_status_check
      CHECK (status IN ('pending', 'queued', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'c'
      AND c.conname = 'fiscal_print_jobs_kind_check'
      AND n.nspname = 'public'
      AND r.relname = 'fiscal_print_jobs'
  ) THEN
    ALTER TABLE public.fiscal_print_jobs
      ADD CONSTRAINT fiscal_print_jobs_kind_check
      CHECK (kind IN ('sale_receipt', 'z_report'));
  END IF;
END $$;

COMMIT;
