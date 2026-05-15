BEGIN;

-- Base ledger append-only: lifecycle vendita (status) vs tipo operazione (operation_type).
-- fiscal_status resta invariato; nessuna logica storno/reso in questa migration.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS operation_type text NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS original_sale_id bigint NULL,
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by uuid NULL,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS return_reason text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'c'
      AND c.conname = 'sales_status_check'
      AND n.nspname = 'public'
      AND r.relname = 'sales'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_status_check
      CHECK (status IN (
        'posted',
        'pre_fiscal_voided',
        'fiscal_void_pending',
        'fiscally_voided',
        'partially_returned',
        'returned',
        'correction_pending'
      ));
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
      AND c.conname = 'sales_operation_type_check'
      AND n.nspname = 'public'
      AND r.relname = 'sales'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_operation_type_check
      CHECK (operation_type IN (
        'sale',
        'pre_fiscal_void',
        'fiscal_void',
        'return',
        'payment_correction_sale'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'f'
      AND c.conname = 'sales_original_sale_id_fkey'
      AND n.nspname = 'public'
      AND r.relname = 'sales'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_original_sale_id_fkey
      FOREIGN KEY (original_sale_id) REFERENCES public.sales (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'f'
      AND c.conname = 'sales_voided_by_fkey'
      AND n.nspname = 'public'
      AND r.relname = 'sales'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_voided_by_fkey
      FOREIGN KEY (voided_by) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_original_sale_id_idx
  ON public.sales (original_sale_id);

CREATE INDEX IF NOT EXISTS sales_status_idx
  ON public.sales (status);

CREATE INDEX IF NOT EXISTS sales_operation_type_idx
  ON public.sales (operation_type);

COMMIT;
