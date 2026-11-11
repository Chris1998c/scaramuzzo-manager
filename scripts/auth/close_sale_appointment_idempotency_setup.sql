-- Harness isolato per close_sale_atomic idempotenza appuntamento.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.cash_sessions (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL,
  closed_at timestamptz,
  opened_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  id serial PRIMARY KEY,
  salon_id integer NOT NULL,
  sale_id bigint,
  status text NOT NULL DEFAULT 'in_sala'
);

CREATE TABLE public.sales (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL,
  customer_id uuid,
  total_amount numeric NOT NULL,
  payment_method text NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  date timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  cash_session_id bigint,
  fiscal_status text
);

CREATE UNIQUE INDEX sales_salon_idempotency_key_unique
  ON public.sales (salon_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE public.sale_items (
  id bigserial PRIMARY KEY,
  sale_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  service_id integer,
  product_id integer,
  staff_id integer,
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  discount numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.product_stock (
  product_id integer NOT NULL,
  salon_id integer NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, salon_id)
);

CREATE TABLE public.stock_movements (
  id bigserial PRIMARY KEY,
  product_id integer NOT NULL,
  qty numeric NOT NULL,
  from_salon integer,
  movement_type text NOT NULL,
  sale_id bigint,
  sale_item_id bigint,
  created_by uuid,
  movement_group_id uuid,
  source text
);

CREATE TABLE public.fiscal_print_jobs (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL,
  created_by uuid,
  kind text NOT NULL,
  sale_id bigint,
  cash_session_id bigint,
  printer_model text,
  printer_serial text,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending'
);

CREATE OR REPLACE FUNCTION public.ledger_movement_group_from_text(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(coalesce(p, ''))::uuid;
$$;

CREATE OR REPLACE FUNCTION public.stock_move(
  p_product_id integer,
  p_qty numeric,
  p_from_salon integer DEFAULT NULL,
  p_to_salon integer DEFAULT NULL,
  p_movement_type text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL,
  p_sale_id bigint DEFAULT NULL,
  p_transfer_id bigint DEFAULT NULL,
  p_sale_item_id bigint DEFAULT NULL,
  p_transfer_item_id bigint DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_movement_group_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.product_stock
  SET quantity = quantity - p_qty
  WHERE product_id = p_product_id AND salon_id = p_from_salon;

  INSERT INTO public.stock_movements (
    product_id, qty, from_salon, movement_type, sale_id, sale_item_id,
    created_by, movement_group_id, source
  ) VALUES (
    p_product_id, p_qty, p_from_salon, coalesce(p_movement_type, 'sale'),
    p_sale_id, p_sale_item_id, p_created_by, p_movement_group_id, p_source
  );
END;
$$;

INSERT INTO public.cash_sessions (salon_id) VALUES (1);
INSERT INTO public.appointments (salon_id, status) VALUES (1, 'in_sala');
INSERT INTO public.product_stock (product_id, salon_id, quantity) VALUES (7, 1, 5);
