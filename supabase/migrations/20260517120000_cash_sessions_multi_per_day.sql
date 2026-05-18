-- Consente più sessioni cassa per salon_id + session_date (riaperture stesso giorno).
-- Una sola sessione aperta per salone (closed_at IS NULL).

BEGIN;

DROP INDEX IF EXISTS public.cash_sessions_unique;

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_salon
  ON public.cash_sessions (salon_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS cash_sessions_salon_session_date_idx
  ON public.cash_sessions (salon_id, session_date, opened_at DESC);

CREATE OR REPLACE VIEW public.cash_closure_summary AS
SELECT
  cs.id AS cash_session_id,
  cs.salon_id,
  cs.session_date,
  cs.opening_cash,
  cs.closing_cash,
  COALESCE(
    (
      SELECT sum(s.total_amount)
      FROM public.sales s
      WHERE s.cash_session_id = cs.id
        AND s.payment_method = 'cash'
    ),
    (
      SELECT sum(s.total_amount)
      FROM public.sales s
      WHERE s.salon_id = cs.salon_id
        AND s.cash_session_id IS NULL
        AND s.payment_method = 'cash'
        AND s.created_at >= cs.opened_at
        AND (cs.closed_at IS NULL OR s.created_at <= cs.closed_at)
    ),
    0::numeric
  ) AS expected_cash_sales,
  CASE
    WHEN cs.closing_cash IS NULL THEN NULL::numeric
    ELSE round(
      cs.closing_cash - (
        cs.opening_cash + COALESCE(
          (
            SELECT sum(s.total_amount)
            FROM public.sales s
            WHERE s.cash_session_id = cs.id
              AND s.payment_method = 'cash'
          ),
          (
            SELECT sum(s.total_amount)
            FROM public.sales s
            WHERE s.salon_id = cs.salon_id
              AND s.cash_session_id IS NULL
              AND s.payment_method = 'cash'
              AND s.created_at >= cs.opened_at
              AND s.created_at <= cs.closed_at
          ),
          0::numeric
        )
      ),
      2
    )
  END AS cash_difference
FROM public.cash_sessions cs;

CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_salon_id integer,
  p_date date DEFAULT CURRENT_DATE,
  p_opening_cash numeric DEFAULT 0,
  p_notes text DEFAULT NULL::text
)
RETURNS TABLE (cash_session_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_id bigint;
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id mancante';
  END IF;

  IF NOT public.can_access_salon(p_salon_id) THEN
    RAISE EXCEPTION 'accesso negato al salone %', p_salon_id;
  END IF;

  SELECT cs.id
  INTO v_id
  FROM public.cash_sessions cs
  WHERE cs.salon_id = p_salon_id
    AND cs.closed_at IS NULL
  ORDER BY cs.opened_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    cash_session_id := v_id;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.cash_sessions (
    salon_id,
    session_date,
    opened_by,
    opening_cash,
    notes,
    status
  )
  VALUES (
    p_salon_id,
    p_date,
    auth.uid(),
    coalesce(p_opening_cash, 0),
    p_notes,
    'open'
  )
  RETURNING id INTO v_id;

  cash_session_id := v_id;
  RETURN NEXT;
END;
$function$;

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
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id mancante';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'date mancante';
  END IF;

  IF p_closing_cash IS NULL THEN
    RAISE EXCEPTION 'closing_cash mancante';
  END IF;

  IF NOT public.can_access_salon(p_salon_id) THEN
    RAISE EXCEPTION 'accesso negato al salone %', p_salon_id;
  END IF;

  SELECT cs.id, cs.opening_cash
  INTO v_id, v_opening
  FROM public.cash_sessions cs
  WHERE cs.salon_id = p_salon_id
    AND cs.closed_at IS NULL
  ORDER BY cs.opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessuna sessione cassa aperta per il salone %', p_salon_id;
  END IF;

  v_expected_cash := coalesce(
    (
      SELECT sum(s.total_amount)
      FROM public.sales s
      WHERE s.cash_session_id = v_id
        AND s.payment_method = 'cash'
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
  SET
    closing_cash = p_closing_cash,
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

COMMIT;
