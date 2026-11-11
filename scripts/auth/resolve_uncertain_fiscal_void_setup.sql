-- Harness isolato: resolve_uncertain_fiscal_void (void_printed / void_not_printed).
-- Nessuna Epson, nessun DB remoto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.current_role_name() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULL;
$$;
CREATE OR REPLACE FUNCTION public.can_access_salon(p integer) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION public.ledger_movement_group_from_text(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(coalesce(p, ''))::uuid;
$$;

CREATE TABLE public.products (
  id integer PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO public.products (id, active) VALUES (7, true);

CREATE TABLE public.product_stock (
  product_id integer NOT NULL,
  salon_id integer NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, salon_id)
);

CREATE TABLE public.stock_movements (
  id bigserial PRIMARY KEY,
  product_id integer NOT NULL,
  from_salon integer,
  to_salon integer,
  quantity numeric NOT NULL,
  movement_type text NOT NULL,
  reason text,
  client_request_id uuid,
  sale_id bigint,
  transfer_id bigint,
  sale_item_id bigint,
  transfer_item_id bigint,
  created_by uuid,
  movement_group_id uuid,
  source text,
  qty_before numeric,
  qty_after numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stock_movements_client_request_id_uidx
  ON public.stock_movements (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE TABLE public.sales (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'posted',
  fiscal_status text NOT NULL DEFAULT 'printed',
  void_reason text,
  voided_by uuid,
  voided_at timestamptz
);

CREATE TABLE public.sale_items (
  id bigserial PRIMARY KEY,
  sale_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id integer,
  quantity numeric NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  service_id integer,
  staff_id integer
);

CREATE TABLE public.fiscal_print_jobs (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL DEFAULT 1,
  created_by uuid,
  kind text NOT NULL,
  sale_id bigint,
  cash_session_id bigint,
  printer_serial text,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  completed_at timestamptz,
  processed_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fiscal_documents (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  salon_id integer NOT NULL,
  sale_id bigint NULL,
  fiscal_print_job_id bigint NOT NULL REFERENCES public.fiscal_print_jobs (id),
  document_type text NOT NULL,
  printer_serial text NULL,
  fiscal_receipt_number text NULL,
  fiscal_receipt_amount numeric NULL,
  fiscal_receipt_date text NULL,
  fiscal_receipt_time text NULL,
  receipt_iso_datetime text NULL,
  z_rep_number text NULL,
  raw_result jsonb NULL,
  original_fiscal_document_id bigint NULL REFERENCES public.fiscal_documents (id),
  CONSTRAINT fiscal_documents_document_type_check
    CHECK (document_type IN ('sale_receipt', 'void_receipt', 'return_receipt', 'z_report'))
);

CREATE UNIQUE INDEX fiscal_documents_job_id_idx
  ON public.fiscal_documents (fiscal_print_job_id);

INSERT INTO public.product_stock (product_id, salon_id, quantity) VALUES (7, 1, 10);
