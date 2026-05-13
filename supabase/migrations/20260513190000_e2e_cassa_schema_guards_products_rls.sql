BEGIN;

-- A) cash_sessions.printer_enabled (idempotent; allinea DB remoti senza migration intermedia)
ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS printer_enabled boolean NOT NULL DEFAULT true;

-- B) sales.idempotency_key + indice unico parziale (idempotent)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_salon_idempotency_key_unique
  ON public.sales (salon_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- E) RLS products: rimuovi select legacy su auth.jwt() role magazzino; select coerente per authenticated
DROP POLICY IF EXISTS magazzino_products ON public.products;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products_select_authenticated'
  ) THEN
    CREATE POLICY products_select_authenticated
    ON public.products
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END
$policy$;

COMMIT;
