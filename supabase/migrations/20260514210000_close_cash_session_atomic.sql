BEGIN;

-- Chiusura cassa atomica: lock sessione, gate ricevute, Z report, update sessione in un'unica transazione.
CREATE OR REPLACE FUNCTION public.close_cash_session_atomic(
  p_cash_session_id bigint,
  p_salon_id integer,
  p_user_id uuid,
  p_closing_cash numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  cash_session_id bigint,
  z_job_id bigint,
  closed_at timestamptz,
  already_closed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cs public.cash_sessions%ROWTYPE;
  v_now timestamptz := now();
  v_profile record;
  v_z_job_id bigint;
  v_closing numeric;
  v_on_date date;
BEGIN
  IF p_cash_session_id IS NULL OR p_cash_session_id <= 0 THEN
    RAISE EXCEPTION 'close_cash_session_atomic: cash_session_id richiesto';
  END IF;

  IF p_salon_id IS NULL OR p_salon_id <= 0 THEN
    RAISE EXCEPTION 'close_cash_session_atomic: salon_id richiesto';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'close_cash_session_atomic: user_id richiesto';
  END IF;

  v_closing := round(
    least(1000000::numeric, greatest(0::numeric, coalesce(p_closing_cash, 0)))::numeric,
    2
  );

  v_on_date := (v_now AT TIME ZONE 'Europe/Rome')::date;

  SELECT *
  INTO v_cs
  FROM public.cash_sessions cs
  WHERE cs.id = p_cash_session_id
    AND cs.salon_id = p_salon_id
    AND cs.closed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT *
    INTO v_cs
    FROM public.cash_sessions cs
    WHERE cs.id = p_cash_session_id
      AND cs.salon_id = p_salon_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'close_cash_session_atomic: sessione non trovata o salone non valido';
    END IF;

    IF v_cs.closed_at IS NULL THEN
      RAISE EXCEPTION 'close_cash_session_atomic: sessione non chiudibile';
    END IF;

    SELECT j.id
    INTO v_z_job_id
    FROM public.fiscal_print_jobs j
    WHERE j.kind = 'z_report'
      AND j.cash_session_id = p_cash_session_id
    ORDER BY j.id DESC
    LIMIT 1;

    RETURN QUERY
    SELECT
      v_cs.id,
      v_z_job_id,
      v_cs.closed_at::timestamptz,
      true;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_print_jobs j
    WHERE j.salon_id = p_salon_id
      AND j.kind = 'sale_receipt'
      AND lower(coalesce(j.status, '')) IN ('pending', 'processing', 'error', 'failed')
  ) THEN
    RAISE EXCEPTION 'Impossibile chiudere la cassa: ricevute fiscali non completate.';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.get_fiscal_profile(p_salon_id, v_on_date)
  LIMIT 1;

  SELECT j.id
  INTO v_z_job_id
  FROM public.fiscal_print_jobs j
  WHERE j.kind = 'z_report'
    AND j.cash_session_id = p_cash_session_id
  ORDER BY j.id DESC
  LIMIT 1;

  IF v_z_job_id IS NULL AND v_profile.id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.fiscal_print_jobs (
        salon_id,
        created_by,
        kind,
        cash_session_id,
        printer_model,
        printer_serial,
        payload,
        status
      )
      VALUES (
        p_salon_id,
        p_user_id,
        'z_report',
        p_cash_session_id,
        v_profile.printer_model,
        v_profile.printer_serial,
        jsonb_build_object(
          'cash_session_id', p_cash_session_id,
          'requested_at', v_now::text,
          'printer_serial', coalesce(v_profile.printer_serial, '')
        ),
        'pending'
      )
      RETURNING id INTO v_z_job_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT j2.id
        INTO v_z_job_id
        FROM public.fiscal_print_jobs j2
        WHERE j2.kind = 'z_report'
          AND j2.cash_session_id = p_cash_session_id
        ORDER BY j2.id DESC
        LIMIT 1;
    END;
  END IF;

  UPDATE public.cash_sessions u
  SET
    closing_cash = v_closing,
    status = 'closed',
    closed_by = p_user_id,
    closed_at = v_now,
    notes = CASE
      WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0 THEN trim(p_notes)
      ELSE u.notes
    END
  WHERE u.id = p_cash_session_id;

  RETURN QUERY
  SELECT
    p_cash_session_id,
    v_z_job_id,
    v_now,
    false;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_session_atomic(bigint, integer, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_session_atomic(bigint, integer, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.close_cash_session_atomic(bigint, integer, uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session_atomic(bigint, integer, uuid, numeric, text) TO service_role;

COMMIT;
