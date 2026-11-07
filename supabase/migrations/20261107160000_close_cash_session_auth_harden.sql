-- Harden legacy close_cash_session authorization only.
-- Contabilità (cash_difference / UPDATE sessione) e assenza di job fiscali invariate.
-- Fix: auth.uid() obbligatorio; can_access_salon deve essere IS TRUE (non bypass su NULL).

BEGIN;

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

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'close_cash_session: autenticazione richiesta';
  END IF;

  IF public.can_access_salon(p_salon_id) IS NOT TRUE THEN
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

REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.close_cash_session(integer, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(integer, date, numeric, text) TO service_role;

COMMIT;
