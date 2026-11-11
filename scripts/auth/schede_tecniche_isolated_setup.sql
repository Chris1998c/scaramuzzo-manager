-- Minimal schema for customer_service_cards save/reopen (isolated Postgres).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL,
  first_name text,
  last_name text
);

CREATE TABLE public.customer_service_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_type text NOT NULL CHECK (
    service_type = ANY (
      ARRAY[
        'oxidation_color'::text,
        'gloss'::text,
        'lightening'::text,
        'keratin'::text,
        'botanicals'::text,
        'legacy_note'::text
      ]
    )
  ),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  salon_id integer,
  staff_id integer,
  appointment_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_service_cards_customer_id_idx
  ON public.customer_service_cards (customer_id);
CREATE INDEX customer_service_cards_created_at_idx
  ON public.customer_service_cards (created_at DESC);
CREATE INDEX customer_service_cards_type_idx
  ON public.customer_service_cards (service_type);
