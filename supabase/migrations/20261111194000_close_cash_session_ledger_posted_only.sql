-- Legacy close_cash_session: allinea expected_cash al ledger corrente
-- (status=posted AND operation_type=sale), come Report / Cassa / close_cash_session_atomic.
-- Nessun job fiscale, nessun cambio UI, timestamp/vendite storiche invariati.

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

  -- Stesso insieme contabile di Report/Cassa: solo posted + sale.
  v_expected_cash := coalesce(
    (
      SELECT sum(s.total_amount)
      FROM public.sales s
      WHERE s.cash_session_id = v_id
        AND lower(coalesce(s.payment_method, '')) = 'cash'
        AND lower(coalesce(s.status, 'posted')) = 'posted'
        AND lower(coalesce(s.operation_type, 'sale')) = 'sale'
    ),
    (
      SELECT sum(s.total_amount)
      FROM public.sales s
      WHERE s.salon_id = p_salon_id
        AND s.cash_session_id IS NULL
        AND date(s.created_at) = p_date
        AND lower(coalesce(s.payment_method, '')) = 'cash'
        AND lower(coalesce(s.status, 'posted')) = 'posted'
        AND lower(coalesce(s.operation_type, 'sale')) = 'sale'
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

COMMENT ON FUNCTION public.close_cash_session(integer, date, numeric, text) IS
  'Legacy SECURITY DEFINER. expected_cash = solo sales posted+sale (cash). UI: close_cash_session_atomic. EXECUTE solo service_role.';

-- Grant invariati rispetto al revoke P0 (service_role only).
REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(integer, date, numeric, text) TO service_role;
