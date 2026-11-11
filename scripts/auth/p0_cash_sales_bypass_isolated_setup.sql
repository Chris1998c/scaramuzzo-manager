-- Schema minimo isolato che riproduce il bypass live (pre-fix) + helper auth JWT.
-- Non tocca produzione. Eseguire su Postgres usa-e-getta.

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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

CREATE TABLE public.roles (
  id integer PRIMARY KEY,
  name text NOT NULL UNIQUE
);
INSERT INTO public.roles (id, name) VALUES
  (1, 'coordinator'),
  (2, 'reception'),
  (3, 'magazzino'),
  (4, 'cliente');

CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  role_id integer NOT NULL REFERENCES public.roles(id)
);

CREATE TABLE public.user_salons (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id),
  salon_id integer NOT NULL
);

CREATE TABLE public.salons (
  id integer PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO public.salons (id, name) VALUES
  (1, 'Roma'),
  (2, 'Corigliano'),
  (3, 'Castrovillari'),
  (4, 'Cosenza'),
  (5, 'Magazzino');

CREATE TABLE public.cash_sessions (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  status text NOT NULL DEFAULT 'open',
  notes text
);
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL,
  customer_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  discount numeric DEFAULT 0,
  date date DEFAULT CURRENT_DATE,
  cash_session_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_items (
  id bigserial PRIMARY KEY,
  sale_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  service_id integer,
  product_id integer,
  staff_id integer,
  quantity numeric NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  discount numeric DEFAULT 0
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT r.name
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$ SELECT public.current_role_name() = 'coordinator'; $$;

CREATE OR REPLACE FUNCTION public.is_magazzino()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$ SELECT public.current_role_name() = 'magazzino'; $$;

CREATE OR REPLACE FUNCTION public.is_reception()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$ SELECT public.current_role_name() = 'reception'; $$;

CREATE OR REPLACE FUNCTION public.current_salon_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT us.salon_id
  FROM public.user_salons us
  WHERE us.user_id = auth.uid()
  ORDER BY us.id DESC
  LIMIT 1;
$$;

-- Live semantics (NON modificare in questo test harness / migration P0)
CREATE OR REPLACE FUNCTION public.can_access_salon(p_salon_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT CASE
    WHEN public.is_coordinator() OR public.is_magazzino() THEN true
    ELSE public.current_salon_id() = p_salon_id
  END;
$$;

GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_coordinator() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_magazzino() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_reception() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_salon_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_salon(integer) TO authenticated, anon, service_role;

-- Pre-fix: EXECUTE authenticated (bypass)
CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_salon_id integer,
  p_date date DEFAULT CURRENT_DATE,
  p_opening_cash numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (cash_session_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id mancante';
  END IF;
  IF public.can_access_salon(p_salon_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'accesso negato al salone %', p_salon_id;
  END IF;

  SELECT cs.id INTO v_id
  FROM public.cash_sessions cs
  WHERE cs.salon_id = p_salon_id AND cs.closed_at IS NULL
  ORDER BY cs.opened_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    cash_session_id := v_id;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.cash_sessions (salon_id, session_date, opened_by, opening_cash, notes, status)
  VALUES (p_salon_id, p_date, auth.uid(), coalesce(p_opening_cash, 0), p_notes, 'open')
  RETURNING id INTO v_id;

  cash_session_id := v_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_salon_id integer,
  p_date date,
  p_closing_cash numeric,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (cash_session_id bigint, cash_difference numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_id bigint;
  v_opening numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'close_cash_session: autenticazione richiesta';
  END IF;
  IF public.can_access_salon(p_salon_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'accesso negato al salone %', p_salon_id;
  END IF;

  SELECT cs.id, cs.opening_cash INTO v_id, v_opening
  FROM public.cash_sessions cs
  WHERE cs.salon_id = p_salon_id AND cs.closed_at IS NULL
  ORDER BY cs.opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessuna sessione cassa aperta per il salone %', p_salon_id;
  END IF;

  UPDATE public.cash_sessions
  SET closing_cash = p_closing_cash,
      closed_by = auth.uid(),
      closed_at = now(),
      status = 'closed',
      notes = coalesce(p_notes, notes)
  WHERE id = v_id;

  cash_session_id := v_id;
  cash_difference := round(p_closing_cash - coalesce(v_opening, 0), 2);
  RETURN NEXT;
END;
$$;

-- Pre-fix grants (live-like)
GRANT EXECUTE ON FUNCTION public.open_cash_session(integer, date, numeric, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_cash_session(integer, date, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(integer, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_session(integer, date, numeric, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.close_cash_session(integer, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(integer, date, numeric, text) TO service_role;

CREATE POLICY cash_sessions_select ON public.cash_sessions
  FOR SELECT TO authenticated
  USING (public.can_access_salon(salon_id));

CREATE POLICY sales_select ON public.sales
  FOR SELECT TO authenticated
  USING (public.can_access_salon(salon_id));

CREATE POLICY sales_insert_auth ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_salon(salon_id));

CREATE POLICY sale_items_select ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id AND public.can_access_salon(s.salon_id)
    )
  );

CREATE POLICY sale_items_insert ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id AND public.can_access_salon(s.salon_id)
    )
  );

GRANT SELECT ON public.users, public.roles, public.user_salons, public.salons TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated, service_role;
GRANT SELECT, INSERT ON public.sales TO authenticated, service_role;
GRANT SELECT, INSERT ON public.sale_items TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Identità di test
INSERT INTO public.users (id, role_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 1), -- coordinator
  ('22222222-2222-2222-2222-222222222222', 3), -- magazzino → solo salone 5
  ('33333333-3333-3333-3333-333333333333', 2), -- reception → salone 1
  ('44444444-4444-4444-4444-444444444444', 4); -- cliente senza saloni

INSERT INTO public.user_salons (user_id, salon_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 5),
  ('33333333-3333-3333-3333-333333333333', 1);
