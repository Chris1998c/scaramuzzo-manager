BEGIN;

CREATE TABLE IF NOT EXISTS public.fiscal_documents (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  salon_id integer NOT NULL REFERENCES public.salons (id),
  sale_id bigint NULL REFERENCES public.sales (id),
  fiscal_print_job_id bigint NOT NULL REFERENCES public.fiscal_print_jobs (id),
  document_type text NOT NULL,
  printer_serial text NULL,
  fiscal_receipt_number text NULL,
  fiscal_receipt_amount numeric NULL,
  fiscal_receipt_date text NULL,
  fiscal_receipt_time text NULL,
  receipt_iso_datetime text NULL,
  z_rep_number text NULL,
  raw_result jsonb NULL,
  original_fiscal_document_id bigint NULL REFERENCES public.fiscal_documents (id),
  CONSTRAINT fiscal_documents_document_type_check
    CHECK (document_type IN ('sale_receipt', 'void_receipt', 'return_receipt', 'z_report'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_documents_job_id_idx
  ON public.fiscal_documents (fiscal_print_job_id);

CREATE INDEX IF NOT EXISTS fiscal_documents_sale_id_idx
  ON public.fiscal_documents (sale_id)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fiscal_documents_original_idx
  ON public.fiscal_documents (original_fiscal_document_id)
  WHERE original_fiscal_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fiscal_documents_doc_lookup_idx
  ON public.fiscal_documents (printer_serial, z_rep_number, fiscal_receipt_number);

ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.fiscal_documents
  TO service_role;

GRANT USAGE, SELECT
  ON SEQUENCE public.fiscal_documents_id_seq
  TO service_role;

-- Estrae tag Epson da responseXml o chiavi camelCase in p_result.
CREATE OR REPLACE FUNCTION public.extract_fiscal_result_field(
  p_result jsonb,
  p_xml text,
  p_tag text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(
      coalesce(
        p_result ->> p_tag,
        CASE
          WHEN p_xml IS NULL OR btrim(p_xml) = '' THEN NULL
          ELSE substring(p_xml FROM ('<' || p_tag || '>\s*([^<]*?)\s*</' || p_tag || '>'))
        END
      )
    ),
    ''
  );
$$;

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
BEGIN
  IF p_result IS NULL THEN
    RETURN;
  END IF;

  v_xml := NULLIF(btrim(coalesce(p_result ->> 'responseXml', '')), '');

  v_printer_serial := coalesce(
    public.extract_fiscal_result_field(p_result, v_xml, 'serialNumber'),
    NULLIF(btrim(coalesce(p_job.printer_serial, '')), '')
  );
  v_fiscal_receipt_number := public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptNumber');
  v_fiscal_receipt_date := public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptDate');
  v_fiscal_receipt_time := public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptTime');
  v_receipt_iso_datetime := public.extract_fiscal_result_field(p_result, v_xml, 'receiptISODateTime');
  v_z_rep_number := public.extract_fiscal_result_field(p_result, v_xml, 'zRepNumber');

  v_amount_raw := public.extract_fiscal_result_field(p_result, v_xml, 'fiscalReceiptAmount');
  IF v_amount_raw IS NOT NULL AND v_amount_raw ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_fiscal_receipt_amount := v_amount_raw::numeric;
  ELSE
    v_fiscal_receipt_amount := NULL;
  END IF;

  IF p_document_type = 'z_report' THEN
    IF v_z_rep_number IS NULL AND v_printer_serial IS NULL AND v_xml IS NULL THEN
      RETURN;
    END IF;
  ELSIF p_document_type = 'sale_receipt' THEN
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
    raw_result
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
    p_result
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
    sale_id = COALESCE(fiscal_documents.sale_id, EXCLUDED.sale_id);
END;
$$;

REVOKE ALL ON FUNCTION public.extract_fiscal_result_field(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_fiscal_document_from_result(public.fiscal_print_jobs, jsonb, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extract_fiscal_result_field(jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_fiscal_document_from_result(public.fiscal_print_jobs, jsonb, text, bigint) TO service_role;

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
  v_sale_status text;
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
  v_kind := coalesce(v_payload ->> 'kind', v_job.kind);

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
    ELSIF v_kind = 'z_report' THEN
      PERFORM public.upsert_fiscal_document_from_result(
        v_job,
        p_result,
        'z_report',
        NULL
      );
    END IF;
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
  INTO v_sale_salon_id, v_sale_status
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
    SELECT s.fiscal_status
    INTO new_sale_status
    FROM public.sales s
    WHERE s.id = v_sale_id;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) TO service_role;

COMMIT;
