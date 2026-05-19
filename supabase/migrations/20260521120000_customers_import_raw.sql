-- Staging import clienti Boss → public.customers (fase 1: solo raw, NON scrive su customers).
-- Tabella tecnica: accesso solo backend con service_role; nessuna policy per anon/authenticated.

CREATE TABLE public.customers_import_raw (
  id bigserial PRIMARY KEY,
  imported_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'boss',
  source_file text,
  source_row_number integer NOT NULL,
  raw jsonb NOT NULL,
  nominativo_raw text,
  first_name_guess text,
  last_name_guess text,
  phone_raw text,
  phone_normalized text,
  email_raw text,
  email_normalized text,
  birth_date_raw text,
  birth_date date,
  sex_raw text,
  sex_normalized text,
  valid_raw text,
  is_valid boolean,
  notes_raw text,
  import_status text NOT NULL DEFAULT 'raw',
  import_warnings text[] NOT NULL DEFAULT '{}',
  matched_customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  imported_customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  CONSTRAINT customers_import_raw_import_status_check CHECK (
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
  CONSTRAINT customers_import_raw_source_row_unique UNIQUE (source, source_row_number)
);

COMMENT ON TABLE public.customers_import_raw IS
  'Staging import clienti Boss (globale, senza salon_id). NON usare da client: solo script/server con service_role.';

COMMENT ON COLUMN public.customers_import_raw.raw IS
  'Riga CSV originale (chiavi header → valori testuali).';

COMMENT ON COLUMN public.customers_import_raw.import_status IS
  'Pipeline: raw → normalized → duplicate_candidate → ready → imported | skipped | error';

CREATE INDEX customers_import_raw_phone_normalized_idx
  ON public.customers_import_raw (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX customers_import_raw_email_normalized_idx
  ON public.customers_import_raw (email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE INDEX customers_import_raw_nominativo_raw_idx
  ON public.customers_import_raw (nominativo_raw)
  WHERE nominativo_raw IS NOT NULL;

CREATE INDEX customers_import_raw_import_status_idx
  ON public.customers_import_raw (import_status);

ALTER TABLE public.customers_import_raw ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: anon/authenticated non possono leggere/scrivere (default deny con RLS on).
-- service_role bypassa RLS; grant espliciti solo a service_role.

REVOKE ALL ON TABLE public.customers_import_raw FROM anon;
REVOKE ALL ON TABLE public.customers_import_raw FROM authenticated;

GRANT ALL ON TABLE public.customers_import_raw TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.customers_import_raw_id_seq TO service_role;
