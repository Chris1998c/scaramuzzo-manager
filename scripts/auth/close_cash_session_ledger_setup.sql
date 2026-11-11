-- Schema minimo per close_cash_session ledger filter (posted vs fiscally_voided).

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

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.can_access_salon(p_salon_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_salon_id IS NOT NULL AND p_salon_id > 0;
$$;

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id integer NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_cash numeric NOT NULL DEFAULT 0,
  closing_cash numeric,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamp without time zone NOT NULL DEFAULT now(),
  closed_at timestamp without time zone,
  closed_by uuid,
  notes text
);

CREATE TABLE IF NOT EXISTS public.sales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id integer NOT NULL,
  cash_session_id bigint REFERENCES public.cash_sessions (id),
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  status text NOT NULL DEFAULT 'posted',
  operation_type text NOT NULL DEFAULT 'sale',
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  date timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiscal_print_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  sale_id bigint,
  cash_session_id bigint,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

-- Baseline legacy (senza filtro status) — applicata prima della migration under test.
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_salon_id integer,
  p_date date,
  p_closing_cash numeric,
  p_notes text DEFAULT NULL::text
)
RETURNS TABLE (cash_session_id bigint, cash_difference numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_id bigint;
  v_opening numeric;
  v_expected_cash numeric;
  v_diff numeric;
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
  ORDER BY cs.opened_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessuna sessione cassa aperta per il salone %', p_salon_id;
  END IF;

  v_expected_cash := coalesce(
    (
      SELECT sum(s.total_amount)
      FROM public.sales s
      WHERE s.cash_session_id = v_id AND s.payment_method = 'cash'
    ),
    (
      SELECT sum(s.total_amount)
      FROM public.sales s
      WHERE s.salon_id = p_salon_id
        AND s.cash_session_id IS NULL
        AND date(s.created_at) = p_date
        AND s.payment_method = 'cash'
    ),
    0
  );

  v_diff := round(p_closing_cash - (coalesce(v_opening, 0) + v_expected_cash), 2);

  UPDATE public.cash_sessions
  SET closing_cash = p_closing_cash,
      closed_by = auth.uid(),
      closed_at = now(),
      status = 'closed',
      notes = coalesce(p_notes, notes)
  WHERE id = v_id;

  cash_session_id := v_id;
  cash_difference := v_diff;
  RETURN NEXT;
END;
$function$;
