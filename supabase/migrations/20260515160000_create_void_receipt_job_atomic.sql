BEGIN;

ALTER TABLE public.fiscal_print_jobs
  DROP CONSTRAINT IF EXISTS fiscal_print_jobs_kind_check;

ALTER TABLE public.fiscal_print_jobs
  ADD CONSTRAINT fiscal_print_jobs_kind_check
  CHECK (kind IN ('sale_receipt', 'void_receipt', 'z_report'));

CREATE OR REPLACE FUNCTION public.create_void_receipt_job_atomic(
  p_sale_id bigint,
  p_user_id uuid,
  p_reason text
)
RETURNS TABLE (
  job_id bigint,
  sale_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_doc public.fiscal_documents%ROWTYPE;
  v_reason text;
  v_existing_void_job_id bigint;
  v_job_id bigint;
  v_payload jsonb;
BEGIN
  job_id := NULL;
  sale_id := NULL;

  IF p_sale_id IS NULL OR p_sale_id <= 0 THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: sale_id richiesto';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: user_id richiesto';
  END IF;

  v_reason := NULLIF(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: reason richiesto';
  END IF;

  SELECT *
  INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: vendita non trovata';
  END IF;

  IF lower(btrim(coalesce(v_sale.status, ''))) <> 'posted' THEN
    RAISE EXCEPTION
      'create_void_receipt_job_atomic: vendita non annullabile (status=%)',
      coalesce(v_sale.status, '');
  END IF;

  IF lower(btrim(coalesce(v_sale.fiscal_status, ''))) <> 'printed' THEN
    RAISE EXCEPTION
      'create_void_receipt_job_atomic: vendita non stampata fiscalmente (fiscal_status=%)',
      coalesce(v_sale.fiscal_status, '');
  END IF;

  SELECT *
  INTO v_doc
  FROM public.fiscal_documents fd
  WHERE fd.sale_id = p_sale_id
    AND fd.document_type = 'sale_receipt'
    AND NULLIF(btrim(coalesce(fd.fiscal_receipt_number, '')), '') IS NOT NULL
    AND NULLIF(btrim(coalesce(fd.z_rep_number, '')), '') IS NOT NULL
    AND NULLIF(btrim(coalesce(fd.fiscal_receipt_date, '')), '') IS NOT NULL
    AND NULLIF(btrim(coalesce(fd.printer_serial, '')), '') IS NOT NULL
  ORDER BY fd.created_at DESC, fd.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'create_void_receipt_job_atomic: documento fiscale sale_receipt con coordinate complete non trovato';
  END IF;

  SELECT j.id
  INTO v_existing_void_job_id
  FROM public.fiscal_print_jobs j
  WHERE j.sale_id = p_sale_id
    AND j.kind = 'void_receipt'
    AND lower(btrim(coalesce(j.status, ''))) IN ('pending', 'processing', 'completed')
  ORDER BY j.id DESC
  LIMIT 1;

  IF v_existing_void_job_id IS NOT NULL THEN
    RAISE EXCEPTION
      'create_void_receipt_job_atomic: annullo fiscale già presente (job_id=%)',
      v_existing_void_job_id;
  END IF;

  UPDATE public.sales s
  SET
    status = 'fiscal_void_pending',
    void_reason = v_reason,
    voided_by = p_user_id,
    voided_at = now()
  WHERE s.id = p_sale_id
    AND lower(btrim(coalesce(s.status, ''))) = 'posted'
    AND lower(btrim(coalesce(s.fiscal_status, ''))) = 'printed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: impossibile aggiornare stato vendita';
  END IF;

  v_payload := jsonb_build_object(
    'kind', 'void_receipt',
    'sale_id', p_sale_id,
    'original_fiscal_document_id', v_doc.id,
    'reason', v_reason,
    'void', jsonb_build_object(
      'z_rep_number', v_doc.z_rep_number,
      'fiscal_receipt_number', v_doc.fiscal_receipt_number,
      'fiscal_receipt_date', v_doc.fiscal_receipt_date,
      'printer_serial', v_doc.printer_serial
    )
  );

  INSERT INTO public.fiscal_print_jobs (
    salon_id,
    created_by,
    kind,
    sale_id,
    cash_session_id,
    printer_serial,
    payload,
    status
  )
  VALUES (
    v_sale.salon_id,
    p_user_id,
    'void_receipt',
    p_sale_id,
    v_sale.cash_session_id,
    v_doc.printer_serial,
    v_payload,
    'pending'
  )
  RETURNING id INTO v_job_id;

  job_id := v_job_id;
  sale_id := p_sale_id;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_void_receipt_job_atomic(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_void_receipt_job_atomic(bigint, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_void_receipt_job_atomic(bigint, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_void_receipt_job_atomic(bigint, uuid, text) TO service_role;

COMMIT;
