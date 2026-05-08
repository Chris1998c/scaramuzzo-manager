BEGIN;

ALTER TABLE public.fiscal_print_jobs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS error_message text NULL;

CREATE OR REPLACE FUNCTION public.finalize_fiscal_job_atomic(
  p_job_id bigint,
  p_success boolean,
  p_error_message text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  already_finalized boolean,
  sale_updated boolean,
  new_job_status text,
  new_sale_status text,
  skipped_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.fiscal_print_jobs%ROWTYPE;
  v_payload jsonb;
  v_kind text;
  v_sale_id bigint;
  v_sale_salon_id integer;
  v_sale_status text;
  v_target_job_status text;
  v_target_sale_status text;
BEGIN
  ok := false;
  already_finalized := false;
  sale_updated := false;
  new_job_status := NULL;
  new_sale_status := NULL;
  skipped_reason := NULL;

  SELECT *
  INTO v_job
  FROM public.fiscal_print_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    skipped_reason := 'job_not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(coalesce(v_job.status, '')) IN ('completed', 'failed') THEN
    ok := true;
    already_finalized := true;
    new_job_status := v_job.status;
    RETURN NEXT;
    RETURN;
  END IF;

  v_target_job_status := CASE WHEN p_success THEN 'completed' ELSE 'failed' END;

  UPDATE public.fiscal_print_jobs
  SET
    status = v_target_job_status,
    completed_at = now(),
    error_message = CASE WHEN p_success THEN NULL ELSE NULLIF(trim(coalesce(p_error_message, '')), '') END
  WHERE id = v_job.id;

  ok := true;
  new_job_status := v_target_job_status;

  v_payload := v_job.payload;
  v_kind := coalesce(v_payload ->> 'kind', v_job.kind);

  IF v_kind <> 'sale_receipt' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF (v_payload ->> 'sale_id') IS NULL OR btrim(v_payload ->> 'sale_id') = '' THEN
    skipped_reason := 'sale_id_missing';
    RETURN NEXT;
    RETURN;
  END IF;

  IF (v_payload ->> 'sale_id') !~ '^[0-9]+$' THEN
    skipped_reason := 'sale_id_invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  v_sale_id := (v_payload ->> 'sale_id')::bigint;
  v_target_sale_status := CASE WHEN p_success THEN 'printed' ELSE 'error' END;

  SELECT salon_id, fiscal_status
  INTO v_sale_salon_id, v_sale_status
  FROM public.sales
  WHERE id = v_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    skipped_reason := 'sale_not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_sale_salon_id <> v_job.salon_id THEN
    skipped_reason := 'sale_salon_mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(coalesce(v_sale_status, '')) IN ('printed', 'error') THEN
    new_sale_status := v_sale_status;
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(coalesce(v_sale_status, '')) NOT IN ('pending', 'queued') THEN
    skipped_reason := 'sale_status_not_updatable';
    new_sale_status := v_sale_status;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.sales
  SET fiscal_status = v_target_sale_status
  WHERE id = v_sale_id
    AND lower(coalesce(fiscal_status, '')) IN ('pending', 'queued');

  IF FOUND THEN
    sale_updated := true;
    new_sale_status := v_target_sale_status;
  ELSE
    SELECT fiscal_status
    INTO new_sale_status
    FROM public.sales
    WHERE id = v_sale_id;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text) TO service_role;

COMMIT;
