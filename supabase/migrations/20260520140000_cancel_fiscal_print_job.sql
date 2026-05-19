-- Annullamento manuale job fiscale (dashboard): pending sempre; processing solo se stale.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_fiscal_print_job(
  p_job_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS SETOF public.fiscal_print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.fiscal_print_jobs%ROWTYPE;
  v_status text;
  v_reason text;
  v_stale_threshold timestamptz := now() - interval '5 minutes';
BEGIN
  IF p_job_id IS NULL OR p_job_id <= 0 THEN
    RAISE EXCEPTION 'cancel_fiscal_print_job: job_id richiesto e deve essere > 0';
  END IF;

  SELECT *
  INTO v_job
  FROM public.fiscal_print_jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_fiscal_print_job: job % non trovato', p_job_id;
  END IF;

  v_status := lower(btrim(coalesce(v_job.status, '')));

  -- Idempotente: già cancelled → ritorna riga corrente.
  IF v_status = 'cancelled' THEN
    RETURN QUERY
    SELECT *
    FROM public.fiscal_print_jobs j
    WHERE j.id = p_job_id;
    RETURN;
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION
      'cancel_fiscal_print_job: job % completed non annullabile',
      p_job_id;
  END IF;

  IF v_status = 'failed' THEN
    RAISE EXCEPTION
      'cancel_fiscal_print_job: job % failed — usare requeue_fiscal_print_job, non cancel',
      p_job_id;
  END IF;

  IF v_status = 'pending' THEN
    NULL;
  ELSIF v_status = 'processing' THEN
    IF v_job.locked_at IS NOT NULL THEN
      IF v_job.locked_at > v_stale_threshold THEN
        RAISE EXCEPTION
          'cancel_fiscal_print_job: job % ancora in lavorazione (locked_at=%)',
          p_job_id,
          v_job.locked_at;
      END IF;
    ELSIF v_job.created_at > v_stale_threshold THEN
      RAISE EXCEPTION
        'cancel_fiscal_print_job: job % ancora in lavorazione (created_at=%)',
        p_job_id,
        v_job.created_at;
    END IF;
  ELSE
    RAISE EXCEPTION
      'cancel_fiscal_print_job: stato "%" non supportato per annullamento',
      v_job.status;
  END IF;

  v_reason := NULLIF(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    v_reason := 'dashboard';
  END IF;

  UPDATE public.fiscal_print_jobs u
  SET
    status = 'cancelled',
    error_message = 'manual_cancel: ' || v_reason,
    completed_at = now(),
    processed_at = coalesce(u.processed_at, now()),
    locked_by = NULL,
    locked_at = NULL
  WHERE u.id = p_job_id;

  RETURN QUERY
  SELECT *
  FROM public.fiscal_print_jobs j
  WHERE j.id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_fiscal_print_job(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_fiscal_print_job(bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_fiscal_print_job(bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_fiscal_print_job(bigint, text) TO service_role;

COMMIT;
