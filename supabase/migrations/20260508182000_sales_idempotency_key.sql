BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_salon_idempotency_key_unique
  ON public.sales (salon_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
