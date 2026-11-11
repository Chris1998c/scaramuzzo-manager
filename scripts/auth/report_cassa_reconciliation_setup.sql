-- Schema minimo per assert void exclusion ledger (posted vs fiscally_voided).

CREATE TABLE IF NOT EXISTS public.sales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id integer NOT NULL DEFAULT 1,
  cash_session_id integer,
  total_amount numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  payment_method text,
  status text NOT NULL DEFAULT 'posted',
  operation_type text NOT NULL DEFAULT 'sale',
  date timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sale_id bigint NOT NULL REFERENCES public.sales (id) ON DELETE CASCADE,
  service_id integer,
  product_id integer,
  staff_id integer,
  quantity numeric NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0
);
