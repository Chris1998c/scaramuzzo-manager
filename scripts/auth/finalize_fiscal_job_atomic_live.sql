CREATE OR REPLACE FUNCTION public.finalize_fiscal_job_atomic(p_job_id bigint, p_success boolean, p_error_message text DEFAULT NULL::text, p_result jsonb DEFAULT NULL::jsonb, p_bridge_id text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, already_finalized boolean, sale_updated boolean, new_job_status text, new_sale_status text, skipped_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.fiscal_print_jobs%ROWTYPE;
  v_payload jsonb;
  v_kind text;
  v_sale_id bigint;
  v_sale_salon_id integer;
  v_sale_fiscal_status text;
  v_sale_ledger_status text;
  v_target_job_status text;
  v_target_sale_status text;
  v_job_status text;
  v_bridge_id text;
BEGIN
  ok := false;
  already_finalized := false;
  sale_updated := false;
  new_job_status := NULL;
  new_sale_status := NULL;
  skipped_reason := NULL;

  IF p_job_id IS NULL OR p_job_id <= 0 THEN
    skipped_reason := 'job_id_invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO v_job FROM public.fiscal_print_jobs WHERE id = p_job_id FOR UPDATE;

  IF NOT FOUND THEN
    skipped_reason := 'job_not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  v_job_status := lower(btrim(coalesce(v_job.status, '')));

  IF v_job_status IN ('completed', 'failed') THEN
    ok := true;
    already_finalized := true;
    new_job_status := v_job.status;
    RETURN NEXT;
    RETURN;
  END IF;

  v_bridge_id := NULLIF(btrim(coalesce(p_bridge_id, '')), '');

  IF v_bridge_id IS NOT NULL THEN
    IF coalesce(btrim(v_job.locked_by), '') <> v_bridge_id THEN
      skipped_reason := 'bridge_ownership_mismatch';
      new_job_status := v_job.status;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  IF v_job_status <> 'processing' THEN
    skipped_reason := 'job_not_processing';
    new_job_status := v_job.status;
    RETURN NEXT;
    RETURN;
  END IF;

  v_target_job_status := CASE WHEN p_success THEN 'completed' ELSE 'failed' END;

  UPDATE public.fiscal_print_jobs
  SET
    status = v_target_job_status,
    completed_at = now(),
    processed_at = now(),
    error_message = CASE WHEN p_success THEN NULL ELSE NULLIF(btrim(coalesce(p_error_message, '')), '') END,
    locked_by = NULL,
    locked_at = NULL,
    result = p_result
  WHERE id = v_job.id;

  ok := true;
  new_job_status := v_target_job_status;

  v_payload := v_job.payload;
  v_kind := lower(btrim(coalesce(v_payload ->> 'kind', v_job.kind)));

  v_sale_id := NULL;
  IF v_job.sale_id IS NOT NULL AND v_job.sale_id > 0 THEN
    v_sale_id := v_job.sale_id;
  ELSIF (v_payload ->> 'sale_id') ~ '^[0-9]+$' THEN
    v_sale_id := (v_payload ->> 'sale_id')::bigint;
  END IF;

  IF p_success AND p_result IS NOT NULL THEN
    IF v_kind = 'sale_receipt' THEN
      PERFORM public.upsert_fiscal_document_from_result(v_job, p_result, 'sale_receipt', v_sale_id);
    ELSIF v_kind = 'void_receipt' THEN
      PERFORM public.upsert_fiscal_document_from_result(v_job, p_result, 'void_receipt', v_sale_id);
    ELSIF v_kind = 'z_report' THEN
      PERFORM public.upsert_fiscal_document_from_result(v_job, p_result, 'z_report', NULL);
    END IF;
  END IF;

  IF v_kind = 'void_receipt' THEN
    IF v_sale_id IS NULL OR v_sale_id <= 0 THEN
      skipped_reason := 'sale_id_missing';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT s.salon_id, s.fiscal_status, s.status
    INTO v_sale_salon_id, v_sale_fiscal_status, v_sale_ledger_status
    FROM public.sales s
    WHERE s.id = v_sale_id
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

    IF p_success THEN
      UPDATE public.sales s
      SET
        status = 'fiscally_voided',
        fiscal_status = 'voided',
        voided_at = COALESCE(s.voided_at, now())
      WHERE s.id = v_sale_id
        AND lower(btrim(coalesce(s.status, ''))) = 'fiscal_void_pending';

      IF FOUND THEN
        sale_updated := true;
        new_sale_status := 'voided';
      ELSE
        SELECT s.status, s.fiscal_status
        INTO v_sale_ledger_status, v_sale_fiscal_status
        FROM public.sales s
        WHERE s.id = v_sale_id;

        IF lower(btrim(coalesce(v_sale_ledger_status, ''))) = 'fiscally_voided' THEN
          sale_updated := false;
          new_sale_status := coalesce(v_sale_fiscal_status, 'voided');
        ELSE
          skipped_reason := 'sale_status_not_void_pending';
          new_sale_status := v_sale_ledger_status;
        END IF;
      END IF;

      SELECT lower(btrim(coalesce(s.status, '')))
      INTO v_sale_ledger_status
      FROM public.sales s
      WHERE s.id = v_sale_id;

      IF v_sale_ledger_status = 'fiscally_voided' THEN
        PERFORM public.reverse_sale_stock_for_void(v_sale_id, v_job.created_by);
      END IF;
    ELSE
      UPDATE public.sales s
      SET status = 'posted', fiscal_status = 'printed'
      WHERE s.id = v_sale_id
        AND lower(btrim(coalesce(s.status, ''))) = 'fiscal_void_pending';

      IF FOUND THEN
        sale_updated := true;
        new_sale_status := 'printed';
      ELSE
        SELECT s.status, s.fiscal_status
        INTO v_sale_ledger_status, v_sale_fiscal_status
        FROM public.sales s
        WHERE s.id = v_sale_id;
        skipped_reason := 'sale_status_not_void_pending';
        new_sale_status := coalesce(v_sale_fiscal_status, v_sale_ledger_status);
      END IF;
    END IF;

    RETURN NEXT;
    RETURN;
  END IF;

  IF v_kind <> 'sale_receipt' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_sale_id IS NULL OR v_sale_id <= 0 THEN
    skipped_reason := 'sale_id_missing';
    RETURN NEXT;
    RETURN;
  END IF;

  v_target_sale_status := CASE WHEN p_success THEN 'printed' ELSE 'error' END;

  SELECT s.salon_id, s.fiscal_status
  INTO v_sale_salon_id, v_sale_fiscal_status
  FROM public.sales s
  WHERE s.id = v_sale_id
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

  IF lower(coalesce(v_sale_fiscal_status, '')) IN ('printed', 'error') THEN
    new_sale_status := v_sale_fiscal_status;
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(coalesce(v_sale_fiscal_status, '')) NOT IN ('pending', 'queued') THEN
    skipped_reason := 'sale_status_not_updatable';
    new_sale_status := v_sale_fiscal_status;
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
    SELECT s.fiscal_status INTO new_sale_status FROM public.sales s WHERE s.id = v_sale_id;
  END IF;

  RETURN NEXT;
END;
$function$
;
