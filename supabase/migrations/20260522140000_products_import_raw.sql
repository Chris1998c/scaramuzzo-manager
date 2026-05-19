-- Staging import prodotti/magazzino Boss → public.products / product_stock (fase 1: solo raw).
-- Tabella tecnica temporanea: accesso solo backend con service_role; nessuna policy per anon/authenticated.

CREATE TABLE public.products_import_raw (
  id bigserial PRIMARY KEY,
  imported_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'boss',
  source_file text NOT NULL,
  source_salon_name text NOT NULL,
  source_salon_id integer NOT NULL,
  source_row_number integer NOT NULL,
  raw jsonb NOT NULL,
  name_raw text,
  name_normalized text,
  category_raw text,
  category_normalized text,
  qty_raw text,
  qty numeric,
  price_raw text,
  price numeric,
  cost_raw text,
  cost numeric,
  import_status text NOT NULL DEFAULT 'raw',
  import_warnings text[] NOT NULL DEFAULT '{}',
  matched_product_id bigint,
  imported_product_id bigint,
  CONSTRAINT products_import_raw_import_status_check CHECK (
    import_status IN (
      'raw',
      'normalized',
      'duplicate_candidate',
      'ready',
      'imported',
      'skipped',
      'error'
    )
  ),
  CONSTRAINT products_import_raw_source_salon_row_unique UNIQUE (
    source,
    source_salon_id,
    source_row_number
  )
);

COMMENT ON TABLE public.products_import_raw IS
  'Staging temporanea import prodotti Boss per salone (giacenze per source_salon_id). NON usare da client: solo script/server con service_role. Non scrive su products/product_stock fino a pipeline dedicata.';

COMMENT ON COLUMN public.products_import_raw.raw IS
  'Riga XLS originale (header MAG002 → valori).';

COMMENT ON COLUMN public.products_import_raw.source_salon_id IS
  'Salon id Boss: 1 Roma, 2 Corigliano, 3 Castrovillari, 4 Cosenza, 5 Magazzino Centrale.';

COMMENT ON COLUMN public.products_import_raw.import_status IS
  'Pipeline: raw → normalized → duplicate_candidate → ready → imported | skipped | error';

CREATE INDEX products_import_raw_source_salon_id_idx
  ON public.products_import_raw (source_salon_id);

CREATE INDEX products_import_raw_name_normalized_idx
  ON public.products_import_raw (name_normalized)
  WHERE name_normalized IS NOT NULL;

CREATE INDEX products_import_raw_category_normalized_idx
  ON public.products_import_raw (category_normalized)
  WHERE category_normalized IS NOT NULL;

CREATE INDEX products_import_raw_import_status_idx
  ON public.products_import_raw (import_status);

ALTER TABLE public.products_import_raw ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: anon/authenticated non possono leggere/scrivere (default deny con RLS on).
-- service_role bypassa RLS; grant espliciti solo a service_role.

REVOKE ALL ON TABLE public.products_import_raw FROM anon;
REVOKE ALL ON TABLE public.products_import_raw FROM authenticated;

GRANT ALL ON TABLE public.products_import_raw TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.products_import_raw_id_seq TO service_role;
