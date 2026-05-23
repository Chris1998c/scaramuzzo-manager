-- P1 Magazzino: transfer atomico, prodotto idempotente, vendita stock aggregato, vista storico trasferimenti.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) create_and_execute_transfer (transazione unica + idempotenza client_request_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_and_execute_transfer(
  p_from_salon integer,
  p_to_salon integer,
  p_items jsonb,
  p_client_request_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_date date DEFAULT NULL,
  p_causale text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_execute_now boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id bigint;
  v_existing_status text;
  v_existing_executed_at timestamptz;
  v_transfer_id bigint;
  v_elem jsonb;
  v_product_id integer;
  v_qty numeric;
  v_parsed_count integer := 0;
  v_actor uuid;
  v_note text;
BEGIN
  IF p_from_salon IS NULL OR p_to_salon IS NULL THEN
    RAISE EXCEPTION 'create_and_execute_transfer: from_salon e to_salon richiesti';
  END IF;
  IF p_from_salon = p_to_salon THEN
    RAISE EXCEPTION 'create_and_execute_transfer: from_salon e to_salon devono differire';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'create_and_execute_transfer: client_request_id richiesto';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'create_and_execute_transfer: items non può essere vuoto';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_client_request_id::text), 1);

  SELECT t.id, t.status, t.executed_at
  INTO v_existing_id, v_existing_status, v_existing_executed_at
  FROM public.transfers t
  WHERE t.client_request_id = p_client_request_id;

  IF FOUND THEN
    IF p_execute_now
      AND v_existing_executed_at IS NULL
      AND coalesce(v_existing_status, '') <> 'executed'
    THEN
      IF v_existing_status <> 'ready' THEN
        UPDATE public.transfers SET status = 'ready' WHERE id = v_existing_id;
      END IF;
      PERFORM public.execute_transfer(v_existing_id, p_actor_id);
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'transfer_id', v_existing_id
    );
  END IF;

  v_actor := p_actor_id;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_items) AS value
  LOOP
    v_product_id := coalesce(
      nullif(v_elem ->> 'product_id', '')::integer,
      nullif(v_elem ->> 'id', '')::integer
    );
    v_qty := nullif(v_elem ->> 'qty', '')::numeric;

    IF v_product_id IS NULL OR v_product_id <= 0 THEN
      RAISE EXCEPTION 'create_and_execute_transfer: product_id non valido in items';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'create_and_execute_transfer: qty non valida per product_id %', v_product_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id = v_product_id AND p.active IS NOT FALSE
    ) THEN
      RAISE EXCEPTION 'create_and_execute_transfer: prodotto % non trovato o non attivo', v_product_id;
    END IF;

    v_parsed_count := v_parsed_count + 1;
  END LOOP;

  IF v_parsed_count <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'create_and_execute_transfer: items non validi';
  END IF;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  INSERT INTO public.transfers (
    from_salon,
    to_salon,
    date,
    causale,
    note,
    status,
    client_request_id
  )
  VALUES (
    p_from_salon,
    p_to_salon,
    p_date,
    nullif(btrim(coalesce(p_causale, '')), ''),
    v_note,
    CASE WHEN p_execute_now THEN 'ready' ELSE 'draft' END,
    p_client_request_id
  )
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.transfer_items (transfer_id, product_id, qty)
  SELECT
    v_transfer_id,
    coalesce(
      nullif(elem ->> 'product_id', '')::integer,
      nullif(elem ->> 'id', '')::integer
    ),
    nullif(elem ->> 'qty', '')::numeric
  FROM jsonb_array_elements(p_items) AS elem;

  IF p_execute_now THEN
    PERFORM public.execute_transfer(v_transfer_id, v_actor);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'transfer_id', v_transfer_id
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id INTO v_existing_id
    FROM public.transfers t
    WHERE t.client_request_id = p_client_request_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'transfer_id', v_existing_id
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_and_execute_transfer(
  integer, integer, jsonb, uuid, uuid, date, text, text, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_and_execute_transfer(
  integer, integer, jsonb, uuid, uuid, date, text, text, boolean
) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) create_product_with_initial_stock (idempotenza creation + stock)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS creation_client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS products_creation_client_request_id_unique
  ON public.products (creation_client_request_id)
  WHERE creation_client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_product_with_initial_stock(
  p_name text,
  p_category text,
  p_barcode text,
  p_cost numeric,
  p_type text,
  p_description text,
  p_initial_qty numeric,
  p_stock_salon_id integer,
  p_client_request_id uuid,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id integer;
  v_existing_product_id integer;
  v_movement_product_id integer;
  v_qty numeric;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'create_product_with_initial_stock: client_request_id richiesto';
  END IF;
  IF nullif(btrim(coalesce(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'create_product_with_initial_stock: name richiesto';
  END IF;
  IF nullif(btrim(coalesce(p_category, '')), '') IS NULL THEN
    RAISE EXCEPTION 'create_product_with_initial_stock: category richiesta';
  END IF;
  IF p_stock_salon_id IS NULL OR p_stock_salon_id <= 0 THEN
    RAISE EXCEPTION 'create_product_with_initial_stock: stock_salon_id non valido';
  END IF;

  v_qty := coalesce(p_initial_qty, 0);
  IF v_qty < 0 THEN
    RAISE EXCEPTION 'create_product_with_initial_stock: initial_qty non valida';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_client_request_id::text), 2);

  SELECT p.id
  INTO v_existing_product_id
  FROM public.products p
  WHERE p.creation_client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'product_id', v_existing_product_id
    );
  END IF;

  SELECT sm.product_id
  INTO v_movement_product_id
  FROM public.stock_movements sm
  WHERE sm.client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'product_id', v_movement_product_id
    );
  END IF;

  INSERT INTO public.products (
    name,
    category,
    barcode,
    cost,
    type,
    description,
    active,
    vat_rate,
    unit,
    creation_client_request_id
  )
  VALUES (
    btrim(p_name),
    btrim(p_category),
    nullif(btrim(coalesce(p_barcode, '')), ''),
    coalesce(p_cost, 0),
    coalesce(nullif(btrim(coalesce(p_type, '')), ''), 'rivendita'),
    nullif(btrim(coalesce(p_description, '')), ''),
    true,
    22,
    'pz',
    p_client_request_id
  )
  RETURNING id INTO v_product_id;

  IF v_qty > 0 THEN
    PERFORM public.stock_move(
      p_product_id := v_product_id,
      p_qty := v_qty,
      p_from_salon := NULL,
      p_to_salon := p_stock_salon_id,
      p_movement_type := 'carico',
      p_reason := 'initial_stock',
      p_client_request_id := p_client_request_id,
      p_created_by := p_created_by,
      p_source := 'manual'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'product_id', v_product_id
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT p.id INTO v_existing_product_id
    FROM public.products p
    WHERE p.creation_client_request_id = p_client_request_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'product_id', v_existing_product_id
      );
    END IF;

    SELECT sm.product_id INTO v_movement_product_id
    FROM public.stock_movements sm
    WHERE sm.client_request_id = p_client_request_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'product_id', v_movement_product_id
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_with_initial_stock(
  text, text, text, numeric, text, text, numeric, integer, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_product_with_initial_stock(
  text, text, text, numeric, text, text, numeric, integer, uuid, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) close_sale_atomic: un stock_move aggregato per product_id (ledger coerente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_sale_atomic(
  p_salon_id integer,
  p_customer_id uuid,
  p_total_amount numeric,
  p_payment_method text,
  p_discount numeric,
  p_items jsonb,
  p_cash_session_id bigint,
  p_appointment_id integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_fiscal_enabled boolean DEFAULT false,
  p_fiscal_payload jsonb DEFAULT NULL,
  p_fiscal_bridge_reachable boolean DEFAULT false
)
RETURNS TABLE (sale_id bigint, fiscal_print_job_id bigint, reused_sale boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id bigint;
  v_agg record;
  v_updated integer;
  v_existing_sale_id bigint;
  v_idempotency_key text;
  v_cash_session_lock bigint;
  v_fiscal_job_id bigint;
  v_fiscal_status text;
  v_payload jsonb;
  v_printer_model text;
  v_printer_serial text;
  v_sale_item_id bigint;
  v_sale_group uuid;
  v_available_qty numeric;
BEGIN
  fiscal_print_job_id := NULL;
  reused_sale := false;

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

  IF p_fiscal_enabled AND (p_fiscal_payload IS NULL OR p_created_by IS NULL) THEN
    RAISE EXCEPTION 'close_sale_atomic: fiscal attivo richiede payload e created_by';
  END IF;

  SELECT cs.id
  INTO v_cash_session_lock
  FROM public.cash_sessions cs
  WHERE cs.id = p_cash_session_id
    AND cs.salon_id = p_salon_id
    AND cs.closed_at IS NULL
  FOR UPDATE;

  IF v_cash_session_lock IS NULL THEN
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
      sale_id := v_existing_sale_id;

      SELECT j.id
      INTO v_fiscal_job_id
      FROM public.fiscal_print_jobs j
      WHERE j.kind = 'sale_receipt'
        AND j.sale_id = v_existing_sale_id
      ORDER BY j.id DESC
      LIMIT 1;

      IF p_fiscal_enabled AND v_fiscal_job_id IS NULL AND p_fiscal_payload IS NOT NULL THEN
        v_fiscal_status := CASE
          WHEN p_fiscal_bridge_reachable THEN 'queued'
          ELSE 'pending'
        END;

        v_payload := p_fiscal_payload || jsonb_build_object('sale_id', v_existing_sale_id);
        v_printer_model := NULLIF(btrim(p_fiscal_payload ->> 'printer_model'), '');
        v_printer_serial := NULLIF(btrim(p_fiscal_payload ->> 'printer_serial'), '');

        INSERT INTO public.fiscal_print_jobs (
          salon_id, created_by, kind, sale_id, cash_session_id,
          printer_model, printer_serial, payload, status
        )
        VALUES (
          p_salon_id, p_created_by, 'sale_receipt', v_existing_sale_id, p_cash_session_id,
          v_printer_model, v_printer_serial, v_payload, 'pending'
        )
        RETURNING id INTO v_fiscal_job_id;

        UPDATE public.sales s
        SET fiscal_status = v_fiscal_status
        WHERE s.id = v_existing_sale_id
          AND lower(coalesce(s.fiscal_status, '')) IN ('pending', 'queued', 'not_required');
      END IF;

      fiscal_print_job_id := v_fiscal_job_id;
      reused_sale := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  FOR v_agg IN
    SELECT
      (elem->>'ref_id')::integer AS product_id,
      SUM((elem->>'quantity')::integer)::integer AS required_qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'kind') = 'product'
    GROUP BY (elem->>'ref_id')::integer
  LOOP
    IF v_agg.product_id IS NULL OR v_agg.product_id <= 0 THEN
      RAISE EXCEPTION 'close_sale_atomic: product_id non valido nel carrello';
    END IF;
    IF v_agg.required_qty IS NULL OR v_agg.required_qty <= 0 THEN
      RAISE EXCEPTION 'close_sale_atomic: quantità prodotto non valida (product_id=%)', v_agg.product_id;
    END IF;

    INSERT INTO public.product_stock (product_id, salon_id, quantity)
    VALUES (v_agg.product_id, p_salon_id, 0)
    ON CONFLICT (product_id, salon_id) DO NOTHING;

    SELECT ps.quantity
    INTO v_available_qty
    FROM public.product_stock ps
    WHERE ps.product_id = v_agg.product_id
      AND ps.salon_id = p_salon_id
    FOR UPDATE;

    v_available_qty := COALESCE(v_available_qty, 0);

    IF v_available_qty < v_agg.required_qty THEN
      RAISE EXCEPTION
        'close_sale_atomic: giacenza insufficiente per prodotto % (disponibili %, richiesti %)',
        v_agg.product_id, v_available_qty, v_agg.required_qty;
    END IF;
  END LOOP;

  IF p_fiscal_enabled THEN
    v_fiscal_status := CASE
      WHEN p_fiscal_bridge_reachable THEN 'queued'
      ELSE 'pending'
    END;
  ELSE
    v_fiscal_status := 'not_required';
  END IF;

  INSERT INTO public.sales (
    salon_id, customer_id, total_amount, payment_method, discount,
    date, idempotency_key, cash_session_id, fiscal_status
  )
  VALUES (
    p_salon_id, p_customer_id, p_total_amount, p_payment_method, COALESCE(p_discount, 0),
    now(),
    CASE WHEN p_appointment_id IS NULL THEN v_idempotency_key ELSE NULL END,
    p_cash_session_id, v_fiscal_status
  )
  RETURNING id INTO v_sale_id;

  v_sale_group := public.ledger_movement_group_from_text('sale:' || v_sale_id::text);

  IF p_fiscal_enabled THEN
    v_payload := p_fiscal_payload || jsonb_build_object('sale_id', v_sale_id);
    v_printer_model := NULLIF(btrim(p_fiscal_payload ->> 'printer_model'), '');
    v_printer_serial := NULLIF(btrim(p_fiscal_payload ->> 'printer_serial'), '');

    INSERT INTO public.fiscal_print_jobs (
      salon_id, created_by, kind, sale_id, cash_session_id,
      printer_model, printer_serial, payload, status
    )
    VALUES (
      p_salon_id, p_created_by, 'sale_receipt', v_sale_id, p_cash_session_id,
      v_printer_model, v_printer_serial, v_payload, v_fiscal_status
    )
    RETURNING id INTO v_fiscal_job_id;

    fiscal_print_job_id := v_fiscal_job_id;
  END IF;

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

  FOR v_agg IN
    SELECT
      (elem->>'ref_id')::integer AS product_id,
      SUM((elem->>'quantity')::integer)::integer AS total_qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'kind') = 'product'
    GROUP BY (elem->>'ref_id')::integer
  LOOP
    v_sale_item_id := NULL;

    SELECT MIN(si.id)
    INTO v_sale_item_id
    FROM public.sale_items si
    WHERE si.sale_id = v_sale_id
      AND si.product_id = v_agg.product_id
      AND si.service_id IS NULL;

    PERFORM public.stock_move(
      p_product_id := v_agg.product_id,
      p_qty := v_agg.total_qty,
      p_from_salon := p_salon_id,
      p_to_salon := NULL,
      p_movement_type := 'sale',
      p_reason := 'Vendita #' || v_sale_id,
      p_sale_id := v_sale_id,
      p_sale_item_id := v_sale_item_id,
      p_created_by := p_created_by,
      p_movement_group_id := v_sale_group,
      p_source := 'sale'
    );
  END LOOP;

  IF p_appointment_id IS NOT NULL AND p_appointment_id > 0 THEN
    UPDATE public.appointments a
    SET sale_id = v_sale_id, status = 'done'
    WHERE a.id = p_appointment_id AND a.sale_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'close_sale_atomic: appuntamento % non trovato o già chiuso (righe aggiornate: %)',
        p_appointment_id, v_updated;
    END IF;
  END IF;

  sale_id := v_sale_id;
  RETURN NEXT;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.close_sale_atomic(
  integer, uuid, numeric, text, numeric, jsonb, bigint, integer, text, uuid, boolean, jsonb, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.close_sale_atomic(
  integer, uuid, numeric, text, numeric, jsonb, bigint, integer, text, uuid, boolean, jsonb, boolean
) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Vista storico trasferimenti (con item_count)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.transfers_list_view;

CREATE VIEW public.transfers_list_view AS
SELECT
  t.id,
  t.from_salon,
  t.to_salon,
  t.status,
  t.created_at,
  t.executed_at,
  t.date,
  t.causale,
  t.note,
  sf.name AS from_salon_name,
  st.name AS to_salon_name,
  COALESCE(ic.item_count, 0)::integer AS item_count
FROM public.transfers t
LEFT JOIN public.salons sf ON sf.id = t.from_salon
LEFT JOIN public.salons st ON st.id = t.to_salon
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS item_count
  FROM public.transfer_items ti
  WHERE ti.transfer_id = t.id
) ic ON true;

ALTER VIEW public.transfers_list_view SET (security_invoker = true);

GRANT SELECT ON public.transfers_list_view TO authenticated;

COMMIT;
