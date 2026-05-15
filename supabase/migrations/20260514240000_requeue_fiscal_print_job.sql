BEGIN;

-- Requeue manuale: failed sempre; processing solo se stale (>5 min) o p_force.
CREATE OR REPLACE FUNCTION public.requeue_fiscal_print_job(
  p_job_id bigint,
  p_force boolean DEFAULT false
)
RETURNS SETOF public.fiscal_print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.fiscal_print_jobs%ROWTYPE;
  v_status text;
BEGIN
  IF p_job_id IS NULL OR p_job_id <= 0 THEN
    RAISE EXCEPTION 'requeue_fiscal_print_job: job_id richiesto e deve essere > 0';
  END IF;

  SELECT *
  INTO v_job
  FROM public.fiscal_print_jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'requeue_fiscal_print_job: job % non trovato', p_job_id;
  END IF;

  v_status := lower(btrim(coalesce(v_job.status, '')));

  IF v_status = 'failed' THEN
    NULL;
  ELSIF v_status = 'processing' THEN
    IF p_force THEN
      NULL;
    ELSIF v_job.locked_at IS NULL THEN
      NULL;
    ELSIF v_job.locked_at <= (now() - interval '5 minutes') THEN
      NULL;
    ELSE
      RAISE EXCEPTION
        'requeue_fiscal_print_job: job % in processing non stale (locked_at=%). Usa force=true per forzare.',
        p_job_id,
        v_job.locked_at;
    END IF;
  ELSE
    RAISE EXCEPTION
      'requeue_fiscal_print_job: stato "%" non consentito (solo failed o processing stale)',
      v_job.status;
  END IF;

  UPDATE public.fiscal_print_jobs u
  SET
    status = 'pending',
    locked_by = NULL,
    locked_at = NULL,
    completed_at = NULL,
    error_message = NULL
  WHERE u.id = p_job_id;

  RETURN QUERY
  SELECT *
  FROM public.fiscal_print_jobs j
  WHERE j.id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_fiscal_print_job(bigint, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.requeue_fiscal_print_job(bigint, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.requeue_fiscal_print_job(bigint, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_fiscal_print_job(bigint, boolean) TO service_role;

COMMIT;
