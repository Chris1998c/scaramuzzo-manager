-- Recovery vendita fiscal_void_pending dopo cancel di void_receipt processing:
-- il coordinator conferma l'esito fisico sulla Epson senza reinviare il void.
-- void_printed  → ledger fiscally_voided + reverse_sale_stock_for_void (idempotente)
-- void_not_printed → ledger posted/printed, nessuno storno stock

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_uncertain_fiscal_void(
  p_sale_id bigint,
  p_actor_id uuid,
  p_outcome text,
  p_confirmation_note text,
  p_void_fiscal_receipt_number text DEFAULT NULL,
  p_void_z_rep_number text DEFAULT NULL,
  p_void_fiscal_receipt_date text DEFAULT NULL,
  p_void_printer_serial text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_outcome text;
  v_note text;
  v_job public.fiscal_print_jobs%ROWTYPE;
  v_job_status text;
  v_active_job_id bigint;
  v_receipt text;
  v_z text;
  v_date text;
  v_serial text;
  v_original_doc_id bigint;
  v_reverse jsonb;
  v_sale_status text;
BEGIN
  IF p_sale_id IS NULL OR p_sale_id <= 0 THEN
    RAISE EXCEPTION 'resolve_uncertain_fiscal_void: sale_id richiesto';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'resolve_uncertain_fiscal_void: actor_id richiesto';
  END IF;

  v_outcome := lower(btrim(coalesce(p_outcome, '')));
  IF v_outcome NOT IN ('void_printed', 'void_not_printed') THEN
    RAISE EXCEPTION 'resolve_uncertain_fiscal_void: outcome deve essere void_printed o void_not_printed';
  END IF;

  v_note := NULLIF(btrim(coalesce(p_confirmation_note, '')), '');
  IF v_note IS NULL OR char_length(v_note) < 10 THEN
    RAISE EXCEPTION 'resolve_uncertain_fiscal_void: confirmation_note obbligatoria (min 10 caratteri)';
  END IF;

  SELECT *
  INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resolve_uncertain_fiscal_void: vendita % non trovata', p_sale_id;
  END IF;

  v_sale_status := lower(btrim(coalesce(v_sale.status, '')));

  -- Idempotenza esiti già applicati
  IF v_outcome = 'void_printed'
     AND v_sale_status = 'fiscally_voided' THEN
    v_reverse := public.reverse_sale_stock_for_void(p_sale_id, p_actor_id);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'outcome', v_outcome,
      'sale_id', p_sale_id,
      'sale_status', 'fiscally_voided',
      'stock_reversed', true,
      'reverse', v_reverse
    );
  END IF;

  IF v_outcome = 'void_not_printed'
     AND v_sale_status = 'posted'
     AND lower(btrim(coalesce(v_sale.fiscal_status, ''))) = 'printed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'outcome', v_outcome,
      'sale_id', p_sale_id,
      'sale_status', 'posted',
      'stock_reversed', false
    );
  END IF;

  IF v_sale_status <> 'fiscal_void_pending' THEN
    RAISE EXCEPTION
      'resolve_uncertain_fiscal_void: vendita non in fiscal_void_pending (status=%)',
      coalesce(v_sale.status, '');
  END IF;

  -- Nessun void ancora in volo
  SELECT j.id
  INTO v_active_job_id
  FROM public.fiscal_print_jobs j
  WHERE j.sale_id = p_sale_id
    AND j.kind = 'void_receipt'
    AND lower(btrim(coalesce(j.status, ''))) IN ('pending', 'processing')
  ORDER BY j.id DESC
  LIMIT 1;

  IF v_active_job_id IS NOT NULL THEN
    RAISE EXCEPTION
      'resolve_uncertain_fiscal_void: void_receipt ancora attivo (job_id=%): attendere o cancellare il job',
      v_active_job_id;
  END IF;

  SELECT *
  INTO v_job
  FROM public.fiscal_print_jobs j
  WHERE j.sale_id = p_sale_id
    AND j.kind = 'void_receipt'
  ORDER BY j.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'resolve_uncertain_fiscal_void: nessun job void_receipt collegato alla vendita %',
      p_sale_id;
  END IF;

  v_job_status := lower(btrim(coalesce(v_job.status, '')));
  IF v_job_status NOT IN ('cancelled', 'failed') THEN
    RAISE EXCEPTION
      'resolve_uncertain_fiscal_void: job void in stato non riconciliabile (%)',
      v_job.status;
  END IF;

  IF v_outcome = 'void_not_printed' THEN
    UPDATE public.sales s
    SET
      status = 'posted',
      fiscal_status = 'printed',
      void_reason = left(
        coalesce(s.void_reason, '') ||
          CASE WHEN coalesce(s.void_reason, '') = '' THEN '' ELSE ' | ' END ||
          'resolve:void_not_printed ' || v_note,
        2000
      )
    WHERE s.id = p_sale_id
      AND lower(btrim(coalesce(s.status, ''))) = 'fiscal_void_pending';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'resolve_uncertain_fiscal_void: impossibile ripristinare vendita %', p_sale_id;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'outcome', v_outcome,
      'sale_id', p_sale_id,
      'sale_status', 'posted',
      'stock_reversed', false,
      'void_job_id', v_job.id
    );
  END IF;

  -- void_printed: richiede coordinate lette dallo scontrino di annullo Epson
  v_receipt := NULLIF(btrim(coalesce(p_void_fiscal_receipt_number, '')), '');
  v_z := NULLIF(btrim(coalesce(p_void_z_rep_number, '')), '');
  v_date := NULLIF(btrim(coalesce(p_void_fiscal_receipt_date, '')), '');
  v_serial := NULLIF(btrim(coalesce(p_void_printer_serial, '')), '');

  IF v_receipt IS NULL OR v_z IS NULL OR v_date IS NULL OR v_serial IS NULL THEN
    RAISE EXCEPTION
      'resolve_uncertain_fiscal_void: per void_printed servono n. scontrino, Z, data e matricola Epson';
  END IF;

  SELECT fd.id
  INTO v_original_doc_id
  FROM public.fiscal_documents fd
  WHERE fd.sale_id = p_sale_id
    AND fd.document_type = 'sale_receipt'
  ORDER BY fd.created_at DESC, fd.id DESC
  LIMIT 1;

  INSERT INTO public.fiscal_documents (
    salon_id,
    sale_id,
    fiscal_print_job_id,
    document_type,
    printer_serial,
    fiscal_receipt_number,
    fiscal_receipt_date,
    z_rep_number,
    raw_result,
    original_fiscal_document_id
  )
  VALUES (
    v_sale.salon_id,
    p_sale_id,
    v_job.id,
    'void_receipt',
    v_serial,
    v_receipt,
    v_date,
    v_z,
    jsonb_build_object(
      'source', 'manual_uncertain_void_resolve',
      'outcome', 'void_printed',
      'confirmed_by', p_actor_id,
      'note', v_note,
      'resolved_at', now()
    ),
    v_original_doc_id
  )
  ON CONFLICT (fiscal_print_job_id) DO UPDATE
  SET
    document_type = 'void_receipt',
    printer_serial = EXCLUDED.printer_serial,
    fiscal_receipt_number = EXCLUDED.fiscal_receipt_number,
    fiscal_receipt_date = EXCLUDED.fiscal_receipt_date,
    z_rep_number = EXCLUDED.z_rep_number,
    raw_result = EXCLUDED.raw_result,
    sale_id = EXCLUDED.sale_id,
    original_fiscal_document_id = COALESCE(
      fiscal_documents.original_fiscal_document_id,
      EXCLUDED.original_fiscal_document_id
    );

  UPDATE public.sales s
  SET
    status = 'fiscally_voided',
    fiscal_status = 'voided',
    voided_at = COALESCE(s.voided_at, now()),
    void_reason = left(
      coalesce(s.void_reason, '') ||
        CASE WHEN coalesce(s.void_reason, '') = '' THEN '' ELSE ' | ' END ||
        'resolve:void_printed ' || v_note,
      2000
    )
  WHERE s.id = p_sale_id
    AND lower(btrim(coalesce(s.status, ''))) = 'fiscal_void_pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resolve_uncertain_fiscal_void: impossibile chiudere vendita %', p_sale_id;
  END IF;

  v_reverse := public.reverse_sale_stock_for_void(p_sale_id, p_actor_id);

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'outcome', v_outcome,
    'sale_id', p_sale_id,
    'sale_status', 'fiscally_voided',
    'stock_reversed', true,
    'void_job_id', v_job.id,
    'reverse', v_reverse
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_uncertain_fiscal_void(
  bigint, uuid, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_uncertain_fiscal_void(
  bigint, uuid, text, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_uncertain_fiscal_void(
  bigint, uuid, text, text, text, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_uncertain_fiscal_void(
  bigint, uuid, text, text, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.resolve_uncertain_fiscal_void(
  bigint, uuid, text, text, text, text, text, text
) IS
  'Coordinator: riconcilia fiscal_void_pending dopo void processing cancellato. void_printed richiede coordinate Epson e storna stock; void_not_printed ripristina posted senza storno. Non reinvia void.';

COMMIT;
