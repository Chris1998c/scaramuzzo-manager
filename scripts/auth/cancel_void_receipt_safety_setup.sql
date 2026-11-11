-- Harness minimo: cancel void_receipt pending vs processing vs completed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.sales (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'posted',
  fiscal_status text NOT NULL DEFAULT 'printed',
  void_reason text,
  voided_by uuid,
  voided_at timestamptz
);

CREATE TABLE public.fiscal_print_jobs (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL DEFAULT 1,
  created_by uuid,
  kind text NOT NULL,
  sale_id bigint,
  cash_session_id bigint,
  printer_serial text,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  completed_at timestamptz,
  processed_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Minimal create_void gate used to assert "no second void"
CREATE OR REPLACE FUNCTION public.create_void_receipt_job_atomic(
  p_sale_id bigint,
  p_user_id uuid,
  p_reason text
)
RETURNS TABLE (job_id bigint, sale_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_existing bigint;
  v_job bigint;
BEGIN
  SELECT * INTO v_sale FROM public.sales s WHERE s.id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: vendita non trovata';
  END IF;
  IF lower(btrim(coalesce(v_sale.status, ''))) <> 'posted' THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: vendita non annullabile (status=%)', v_sale.status;
  END IF;
  IF lower(btrim(coalesce(v_sale.fiscal_status, ''))) <> 'printed' THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: vendita non stampata fiscalmente (fiscal_status=%)', v_sale.fiscal_status;
  END IF;

  SELECT j.id INTO v_existing
  FROM public.fiscal_print_jobs j
  WHERE j.sale_id = p_sale_id
    AND j.kind = 'void_receipt'
    AND lower(btrim(coalesce(j.status, ''))) IN ('pending', 'processing', 'completed')
  ORDER BY j.id DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'create_void_receipt_job_atomic: annullo fiscale già presente (job_id=%)', v_existing;
  END IF;

  UPDATE public.sales
  SET status = 'fiscal_void_pending', void_reason = p_reason, voided_by = p_user_id, voided_at = now()
  WHERE id = p_sale_id;

  INSERT INTO public.fiscal_print_jobs (salon_id, created_by, kind, sale_id, status)
  VALUES (v_sale.salon_id, p_user_id, 'void_receipt', p_sale_id, 'pending')
  RETURNING id INTO v_job;

  job_id := v_job;
  sale_id := p_sale_id;
  RETURN NEXT;
END;
$$;
