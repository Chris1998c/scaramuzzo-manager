-- Codice identificativo gestionale obbligatorio e univoco (globale).
-- Formato leggibile: CLI-000001, CLI-000002, …
-- Ordine di numerazione stabile: created_at ASC NULLS LAST, poi id ASC.

-- 1) Aggiunge la colonna senza vincoli (righe esistenti restano valide).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_code text;

-- 2) Backfill deterministico: una riga = un progressivo (non basato su UUID).
UPDATE public.customers AS c
SET customer_code = x.code
FROM (
  SELECT
    id,
    'CLI-' || lpad(
      row_number() OVER (
        ORDER BY created_at ASC NULLS LAST, id ASC
      )::text,
      6,
      '0'
    ) AS code
  FROM public.customers
  WHERE customer_code IS NULL
) AS x
WHERE c.id = x.id;

-- 3) Obbligatorietà: da qui ogni insert deve fornire customer_code (o default lato app).
ALTER TABLE public.customers
  ALTER COLUMN customer_code SET NOT NULL;

-- 4) Univocità globale.
ALTER TABLE public.customers
  ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);
