BEGIN;

-- Collega ogni vendita alla sessione cassa aperta (nullable per righe legacy pre-migration).
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_session_id bigint NULL REFERENCES public.cash_sessions (id);

CREATE INDEX IF NOT EXISTS sales_cash_session_id_idx
  ON public.sales (cash_session_id)
  WHERE cash_session_id IS NOT NULL;

-- Sostituisce la firma 8-arg con la versione che richiede p_cash_session_id.
DROP FUNCTION IF EXISTS public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  integer,
  text
);

CREATE OR REPLACE FUNCTION public.close_sale_atomic(
  p_salon_id integer,
  p_customer_id uuid,
  p_total_amount numeric,
  p_payment_method text,
  p_discount numeric,
  p_items jsonb,
  p_cash_session_id bigint,
  p_appointment_id integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (sale_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id bigint;
  v_item record;
  v_updated integer;
  v_existing_sale_id bigint;
  v_idempotency_key text;
BEGIN
  IF p_salon_id IS NULL OR p_salon_id <= 0 THEN
    RAISE EXCEPTION 'close_sale_atomic: salon_id richiesto e deve essere > 0';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'close_sale_atomic: total_amount non valido';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'close_sale_atomic: payment_method deve essere cash o card';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'close_sale_atomic: p_items non può essere vuoto';
  END IF;

  IF p_discount IS NULL THEN
    p_discount := 0;
  END IF;

  IF p_cash_session_id IS NULL OR p_cash_session_id <= 0 THEN
    RAISE EXCEPTION 'close_sale_atomic: cash_session_id richiesto e deve essere > 0';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cash_sessions cs
    WHERE cs.id = p_cash_session_id
      AND cs.salon_id = p_salon_id
      AND cs.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'close_sale_atomic: sessione cassa % non trovata, salone diverso o già chiusa',
      p_cash_session_id;
  END IF;

  v_idempotency_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');

  IF p_appointment_id IS NULL AND v_idempotency_key IS NOT NULL THEN
    SELECT s.id
    INTO v_existing_sale_id
    FROM public.sales s
    WHERE s.salon_id = p_salon_id
      AND s.idempotency_key = v_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      RETURN QUERY SELECT v_existing_sale_id AS sale_id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.sales (
    salon_id,
    customer_id,
    total_amount,
    payment_method,
    discount,
    date,
    idempotency_key,
    cash_session_id
  )
  VALUES (
    p_salon_id,
    p_customer_id,
    p_total_amount,
    p_payment_method,
    COALESCE(p_discount, 0),
    now(),
    CASE WHEN p_appointment_id IS NULL THEN v_idempotency_key ELSE NULL END,
    p_cash_session_id
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_items (sale_id, service_id, product_id, staff_id, quantity, price, discount)
  SELECT
    v_sale_id,
    CASE WHEN (elem->>'kind') = 'service' THEN (elem->>'ref_id')::integer ELSE NULL END,
    CASE WHEN (elem->>'kind') = 'product' THEN (elem->>'ref_id')::integer ELSE NULL END,
    (elem->>'staff_id')::integer,
    (elem->>'quantity')::integer,
    (elem->>'price')::numeric,
    COALESCE((elem->>'discount')::numeric, 0)
  FROM jsonb_array_elements(p_items) AS elem;

  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) AS elem
  LOOP
    IF (v_item.elem->>'kind') = 'product' THEN
      PERFORM public.stock_move(
        p_product_id := (v_item.elem->>'ref_id')::integer,
        p_qty := (v_item.elem->>'quantity')::integer,
        p_from_salon := p_salon_id,
        p_to_salon := NULL,
        p_movement_type := 'sale',
        p_reason := 'Vendita #' || v_sale_id
      );
    END IF;
  END LOOP;

  IF p_appointment_id IS NOT NULL AND p_appointment_id > 0 THEN
    UPDATE public.appointments a
    SET sale_id = v_sale_id,
        status = 'done'
    WHERE a.id = p_appointment_id
      AND a.sale_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'close_sale_atomic: appuntamento % non trovato o già chiuso (righe aggiornate: %)', p_appointment_id, v_updated;
    END IF;
  END IF;

  RETURN QUERY SELECT v_sale_id AS sale_id;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  bigint,
  integer,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  bigint,
  integer,
  text
) FROM anon;

REVOKE ALL ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  bigint,
  integer,
  text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  bigint,
  integer,
  text
) TO service_role;

COMMIT;
