-- Chiusura amministrativa sessione cassa storica:
-- - coordinator autenticato, ID sessione esplicito, lock + stato open
-- - nessuna dichiarazione contanti (closing_cash resta NULL = non rilevato)
-- - nessun job fiscale / Z / contatto stampante
-- - preserva vendite e fiscal_print_jobs esistenti
-- NON applicare finché non autorizzato sul caso #15 / collaudo.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_close_cash_session(
  p_cash_session_id bigint,
  p_reason text
)
RETURNS TABLE (
  cash_session_id bigint,
  closed_at timestamptz,
  already_closed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_cs public.cash_sessions%ROWTYPE;
  v_now timestamptz := now();
  v_reason text;
  v_note text;
BEGIN
  IF p_cash_session_id IS NULL OR p_cash_session_id <= 0 THEN
    RAISE EXCEPTION 'admin_close_cash_session: cash_session_id richiesto';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'admin_close_cash_session: autenticazione richiesta';
  END IF;

  IF public.is_coordinator() IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_close_cash_session: solo coordinator';
  END IF;

  v_reason := NULLIF(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'admin_close_cash_session: motivazione obbligatoria (min 10 caratteri)';
  END IF;

  SELECT *
  INTO v_cs
  FROM public.cash_sessions cs
  WHERE cs.id = p_cash_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_close_cash_session: sessione % non trovata', p_cash_session_id;
  END IF;

  IF public.can_access_salon(v_cs.salon_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_close_cash_session: accesso negato al salone %', v_cs.salon_id;
  END IF;

  IF v_cs.closed_at IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_cs.id,
      v_cs.closed_at::timestamptz,
      true;
    RETURN;
  END IF;

  IF lower(btrim(coalesce(v_cs.status, ''))) IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION
      'admin_close_cash_session: sessione % non chiudibile (status=%)',
      p_cash_session_id,
      v_cs.status;
  END IF;

  v_note := 'admin_close: ' || v_reason;

  UPDATE public.cash_sessions u
  SET
    status = 'closed',
    closed_by = auth.uid(),
    closed_at = v_now,
    -- closing_cash intenzionalmente non toccato (NULL = conteggio non rilevato)
    notes = CASE
      WHEN NULLIF(btrim(coalesce(u.notes, '')), '') IS NULL THEN v_note
      ELSE btrim(u.notes) || E'\n' || v_note
    END
  WHERE u.id = p_cash_session_id
    AND u.closed_at IS NULL;

  RETURN QUERY
  SELECT
    p_cash_session_id,
    v_now,
    false;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_close_cash_session(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_close_cash_session(bigint, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_close_cash_session(bigint, text) TO authenticated;

COMMENT ON FUNCTION public.admin_close_cash_session(bigint, text) IS
  'Chiusura amministrativa cassa: lascia closing_cash NULL (non rilevato), nessun z_report. Solo coordinator.';

COMMIT;
