-- Chiude lifecycle void_receipt: documento fiscale + sales.status fiscally_voided (o rollback su failure).

BEGIN;

-- Consente fiscal_status='voided' dopo annullo fiscale completato.
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_fiscal_status_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_fiscal_status_check
  CHECK (fiscal_status IN ('pending', 'queued', 'printed', 'error', 'not_required', 'voided'));

CREATE OR REPLACE FUNCTION public.upsert_fiscal_document_from_result(
  p_job public.fiscal_print_jobs,
  p_result jsonb,
  p_document_type text,
  p_sale_id bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xml text;
  v_printer_serial text;
  v_fiscal_receipt_number text;
  v_fiscal_receipt_amount numeric;
  v_fiscal_receipt_date text;
  v_fiscal_receipt_time text;
  v_receipt_iso_datetime text;
  v_z_rep_number text;
  v_amount_raw text;
  v_original_fiscal_document_id bigint;
  v_payload jsonb;
  v_void jsonb;
BEGIN
  IF p_result IS NULL THEN
    RETURN;
  END IF;

  v_payload := coalesce(p_job.payload, '{}'::jsonb);
  v_void := v_payload -> 'void';

  v_xml := NULLIF(btrim(coalesce(p_result ->> 'responseXml', '')), '');

  v_printer_serial := coalesce(
    public.extract_fiscal_result_field(p_result, v_xml, 'serialNumber'),
    NULLIF(btrim(coalesce(p_job.printer_serial, '')), ''),
    NULLIF(btrim(coalesce(v_void ->> 'printer_serial', '')), '')
  );
  v_fiscal_receipt_number := coalesce(
    public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptNumber'),
    NULLIF(btrim(coalesce(v_void ->> 'fiscal_receipt_number', '')), '')
  );
  v_fiscal_receipt_date := coalesce(
    public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptDate'),
    NULLIF(btrim(coalesce(v_void ->> 'fiscal_receipt_date', '')), '')
  );
  v_fiscal_receipt_time := public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptTime');
  v_receipt_iso_datetime := public.extract_fiscal_result_field(p_result, v_xml, 'receiptISODateTime');
  v_z_rep_number := coalesce(
    public.extract_fiscal_result_field(p_result, v_xml, 'zRepNumber'),
    NULLIF(btrim(coalesce(v_void ->> 'z_rep_number', '')), '')
  );

  v_amount_raw := public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptAmount');
  IF v_amount_raw IS NOT NULL AND v_amount_raw ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_fiscal_receipt_amount := v_amount_raw::numeric;
  ELSE
    v_fiscal_receipt_amount := NULL;
  END IF;

  IF (v_payload ->> 'original_fiscal_document_id') ~ '^[0-9]+$' THEN
    v_original_fiscal_document_id := (v_payload ->> 'original_fiscal_document_id')::bigint;
  ELSE
    v_original_fiscal_document_id := NULL;
  END IF;

  IF p_document_type = 'z_report' THEN
    IF v_z_rep_number IS NULL AND v_printer_serial IS NULL AND v_xml IS NULL THEN
      RETURN;
    END IF;
  ELSIF p_document_type IN ('sale_receipt', 'void_receipt') THEN
    IF v_fiscal_receipt_number IS NULL
      AND v_z_rep_number IS NULL
      AND v_printer_serial IS NULL
      AND v_fiscal_receipt_date IS NULL
      AND v_receipt_iso_datetime IS NULL
      AND v_xml IS NULL THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.fiscal_documents (
    salon_id,
    sale_id,
    fiscal_print_job_id,
    document_type,
    printer_serial,
    fiscal_receipt_number,
    fiscal_receipt_amount,
    fiscal_receipt_date,
    fiscal_receipt_time,
    receipt_iso_datetime,
    z_rep_number,
    raw_result,
    original_fiscal_document_id
  )
  VALUES (
    p_job.salon_id,
    p_sale_id,
    p_job.id,
    p_document_type,
    v_printer_serial,
    v_fiscal_receipt_number,
    v_fiscal_receipt_amount,
    v_fiscal_receipt_date,
    v_fiscal_receipt_time,
    v_receipt_iso_datetime,
    v_z_rep_number,
    p_result,
    v_original_fiscal_document_id
  )
  ON CONFLICT (fiscal_print_job_id) DO UPDATE
  SET
    raw_result = COALESCE(EXCLUDED.raw_result, fiscal_documents.raw_result),
    printer_serial = COALESCE(fiscal_documents.printer_serial, EXCLUDED.printer_serial),
    fiscal_receipt_number = COALESCE(fiscal_documents.fiscal_receipt_number, EXCLUDED.fiscal_receipt_number),
    fiscal_receipt_amount = COALESCE(fiscal_documents.fiscal_receipt_amount, EXCLUDED.fiscal_receipt_amount),
    fiscal_receipt_date = COALESCE(fiscal_documents.fiscal_receipt_date, EXCLUDED.fiscal_receipt_date),
    fiscal_receipt_time = COALESCE(fiscal_documents.fiscal_receipt_time, EXCLUDED.fiscal_receipt_time),
    receipt_iso_datetime = COALESCE(fiscal_documents.receipt_iso_datetime, EXCLUDED.receipt_iso_datetime),
    z_rep_number = COALESCE(fiscal_documents.z_rep_number, EXCLUDED.z_rep_number),
    sale_id = COALESCE(fiscal_documents.sale_id, EXCLUDED.sale_id),
    original_fiscal_document_id = COALESCE(
      fiscal_documents.original_fiscal_document_id,
      EXCLUDED.original_fiscal_document_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_fiscal_job_atomic(
  p_job_id bigint,
  p_success boolean,
  p_error_message text DEFAULT NULL,
  p_result jsonb DEFAULT NULL,
  p_bridge_id text DEFAULT NULL
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
    error_message = CASE
      WHEN p_success THEN NULL
      ELSE NULLIF(btrim(coalesce(p_error_message, '')), '')
    END,
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
      PERFORM public.upsert_fiscal_document_from_result(
        v_job,
        p_result,
        'sale_receipt',
        v_sale_id
      );
    ELSIF v_kind = 'void_receipt' THEN
      PERFORM public.upsert_fiscal_document_from_result(
        v_job,
        p_result,
        'void_receipt',
        v_sale_id
      );
    ELSIF v_kind = 'z_report' THEN
      PERFORM public.upsert_fiscal_document_from_result(
        v_job,
        p_result,
        'z_report',
        NULL
      );
    END IF;
  END IF;

  -- Annullo fiscale: aggiorna ledger vendita + documento void (non passare dal ramo sale_receipt).
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
    ELSE
      UPDATE public.sales s
      SET
        status = 'posted',
        fiscal_status = 'printed'
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
    SELECT s.fiscal_status
    INTO new_sale_status
    FROM public.sales s
    WHERE s.id = v_sale_id;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_fiscal_document_from_result(public.fiscal_print_jobs, jsonb, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_fiscal_document_from_result(public.fiscal_print_jobs, jsonb, text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) TO service_role;

COMMIT;
