-- P0 Magazzino: idempotenza atomica stock_move, RLS hardening, stock check cassa,
-- storno giacenza su void fiscale, movimenti_view senza ORDER BY (paginazione client).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) source: void_reversal
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_source_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_source_check
  CHECK (
    source IN (
      'legacy',
      'baseline',
      'manual',
      'sale',
      'transfer',
      'adjustment',
      'inventory',
      'void_reversal'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) stock_move: idempotenza atomica (advisory lock + early return + movement_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_move(
  p_product_id integer,
  p_qty numeric,
  p_from_salon integer,
  p_to_salon integer,
  p_movement_type text,
  p_reason text DEFAULT NULL::text,
  p_client_request_id uuid DEFAULT NULL::uuid,
  p_sale_id bigint DEFAULT NULL::bigint,
  p_transfer_id bigint DEFAULT NULL::bigint,
  p_sale_item_id bigint DEFAULT NULL::bigint,
  p_transfer_item_id bigint DEFAULT NULL::bigint,
  p_created_by uuid DEFAULT NULL::uuid,
  p_movement_group_id uuid DEFAULT NULL::uuid,
  p_source text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_app_role text;
  v_jwt_role text;
  v_is_backend boolean;
  v_from_qty numeric;
  v_to_qty numeric;
  v_from_before numeric;
  v_to_before numeric;
  v_mt text := lower(coalesce(p_movement_type, ''));
  v_mt_db text;
  v_source text;
  v_qty_before numeric;
  v_qty_after numeric;
  v_existing_movement_id bigint;
  v_movement_id bigint;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'p_product_id is required';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'p_qty must be > 0';
  END IF;

  IF v_mt = 'transfer' THEN
    v_mt := 'trasferimento';
  END IF;

  IF v_mt NOT IN ('carico', 'scarico', 'trasferimento', 'sale') THEN
    RAISE EXCEPTION 'invalid movement_type: %', p_movement_type;
  END IF;

  v_mt_db :=
    CASE
      WHEN v_mt = 'carico' THEN 'load'
      WHEN v_mt = 'scarico' THEN 'unload'
      WHEN v_mt = 'trasferimento' THEN 'transfer'
      WHEN v_mt = 'sale' THEN 'sale'
    END;

  IF v_mt = 'carico' THEN
    IF p_to_salon IS NULL THEN
      RAISE EXCEPTION 'carico requires p_to_salon';
    END IF;
    p_from_salon := NULL;
  ELSIF v_mt IN ('scarico', 'sale') THEN
    IF p_from_salon IS NULL THEN
      RAISE EXCEPTION '% requires p_from_salon', v_mt;
    END IF;
    p_to_salon := NULL;
  ELSIF v_mt = 'trasferimento' THEN
    IF p_from_salon IS NULL OR p_to_salon IS NULL THEN
      RAISE EXCEPTION 'trasferimento requires both p_from_salon and p_to_salon';
    END IF;
    IF p_from_salon = p_to_salon THEN
      RAISE EXCEPTION 'trasferimento requires different salons';
    END IF;
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_client_request_id::text), 0);

    SELECT sm.id
    INTO v_existing_movement_id
    FROM public.stock_movements sm
    WHERE sm.client_request_id = p_client_request_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'movement_id', v_existing_movement_id,
        'product_id', p_product_id,
        'movement_type', v_mt_db
      );
    END IF;
  END IF;

  v_source := nullif(btrim(coalesce(p_source, '')), '');
  IF v_source IS NULL THEN
    v_source :=
      CASE v_mt_db
        WHEN 'sale' THEN 'sale'
        WHEN 'transfer' THEN 'transfer'
        ELSE 'manual'
      END;
  END IF;

  v_app_role := nullif(btrim(coalesce(public.current_role_name(), '')), '');
  v_jwt_role := nullif(
    btrim(
      coalesce(
        auth.jwt() ->> 'role',
        current_setting('request.jwt.claim.role', true),
        ''
      )
    ),
    ''
  );

  v_is_backend :=
    v_jwt_role = 'service_role'
    OR (
      v_app_role IS NULL
      AND (
        v_jwt_role IS NULL
        OR v_jwt_role = 'service_role'
      )
    );

  IF v_is_backend THEN
    NULL;
  ELSIF v_app_role IN ('coordinator', 'magazzino', 'reception') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'not allowed (app_role=%, jwt_role=%)', coalesce(v_app_role, ''), coalesce(v_jwt_role, '');
  END IF;

  IF NOT v_is_backend AND v_app_role = 'reception' THEN
    IF p_from_salon IS NOT NULL AND NOT public.can_access_salon(p_from_salon) THEN
      RAISE EXCEPTION 'reception not allowed for from_salon=%', p_from_salon;
    END IF;
    IF p_to_salon IS NOT NULL AND NOT public.can_access_salon(p_to_salon) THEN
      RAISE EXCEPTION 'reception not allowed for to_salon=%', p_to_salon;
    END IF;
  END IF;

  IF p_from_salon IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(p_product_id, p_from_salon);
  END IF;
  IF p_to_salon IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(p_product_id, p_to_salon);
  END IF;

  IF p_from_salon IS NOT NULL THEN
    INSERT INTO public.product_stock (product_id, salon_id, quantity)
    VALUES (p_product_id, p_from_salon, 0)
    ON CONFLICT (product_id, salon_id) DO NOTHING;

    SELECT ps.quantity
    INTO v_from_before
    FROM public.product_stock ps
    WHERE ps.product_id = p_product_id
      AND ps.salon_id = p_from_salon;
  END IF;

  IF p_to_salon IS NOT NULL THEN
    INSERT INTO public.product_stock (product_id, salon_id, quantity)
    VALUES (p_product_id, p_to_salon, 0)
    ON CONFLICT (product_id, salon_id) DO NOTHING;

    SELECT ps.quantity
    INTO v_to_before
    FROM public.product_stock ps
    WHERE ps.product_id = p_product_id
      AND ps.salon_id = p_to_salon;
  END IF;

  IF v_mt = 'carico' THEN
    UPDATE public.product_stock
    SET quantity = quantity + p_qty
    WHERE product_id = p_product_id AND salon_id = p_to_salon;
  ELSIF v_mt IN ('scarico', 'sale') THEN
    UPDATE public.product_stock
    SET quantity = quantity - p_qty
    WHERE product_id = p_product_id AND salon_id = p_from_salon;
  ELSIF v_mt = 'trasferimento' THEN
    UPDATE public.product_stock
    SET quantity = quantity - p_qty
    WHERE product_id = p_product_id AND salon_id = p_from_salon;

    UPDATE public.product_stock
    SET quantity = quantity + p_qty
    WHERE product_id = p_product_id AND salon_id = p_to_salon;
  END IF;

  IF p_from_salon IS NOT NULL THEN
    SELECT quantity INTO v_from_qty
    FROM public.product_stock
    WHERE product_id = p_product_id AND salon_id = p_from_salon;

    IF v_from_qty < 0 THEN
      RAISE EXCEPTION 'negative stock not allowed (product %, salon %, qty %)',
        p_product_id, p_from_salon, v_from_qty;
    END IF;
  END IF;

  IF p_to_salon IS NOT NULL THEN
    SELECT quantity INTO v_to_qty
    FROM public.product_stock
    WHERE product_id = p_product_id AND salon_id = p_to_salon;
  END IF;

  IF v_mt_db IN ('unload', 'sale', 'transfer') AND p_from_salon IS NOT NULL THEN
    v_qty_before := v_from_before;
    v_qty_after := v_from_qty;
  ELSIF v_mt_db = 'load' AND p_to_salon IS NOT NULL THEN
    v_qty_before := v_to_before;
    v_qty_after := v_to_qty;
  END IF;

  INSERT INTO public.stock_movements (
    product_id,
    from_salon,
    to_salon,
    quantity,
    movement_type,
    reason,
    client_request_id,
    sale_id,
    transfer_id,
    sale_item_id,
    transfer_item_id,
    created_by,
    movement_group_id,
    source,
    qty_before,
    qty_after
  )
  VALUES (
    p_product_id,
    p_from_salon,
    p_to_salon,
    CASE WHEN v_mt IN ('scarico', 'sale') THEN -p_qty ELSE p_qty END,
    v_mt_db,
    p_reason,
    p_client_request_id,
    p_sale_id,
    p_transfer_id,
    p_sale_item_id,
    p_transfer_item_id,
    p_created_by,
    p_movement_group_id,
    v_source,
    v_qty_before,
    v_qty_after
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'movement_type', v_mt_db,
    'from_salon', p_from_salon,
    'to_salon', p_to_salon,
    'from_qty', v_from_qty,
    'to_qty', v_to_qty,
    'source', v_source
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.stock_move(
  integer, numeric, integer, integer, text, text, uuid, bigint, bigint, bigint, bigint, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.stock_move(
  integer, numeric, integer, integer, text, text, uuid, bigint, bigint, bigint, bigint, uuid, uuid, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Storno giacenza su annullo fiscale vendita
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_sale_stock_for_void(
  p_sale_id bigint,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salon_id integer;
  v_group uuid;
  v_item record;
  v_needed integer;
  v_done integer;
  v_reversed_lines integer := 0;
  v_line_request_id uuid;
BEGIN
  IF p_sale_id IS NULL OR p_sale_id <= 0 THEN
    RAISE EXCEPTION 'reverse_sale_stock_for_void: sale_id richiesto';
  END IF;

  SELECT COUNT(DISTINCT si.product_id)::integer
  INTO v_needed
  FROM public.sale_items si
  WHERE si.sale_id = p_sale_id
    AND si.product_id IS NOT NULL
    AND si.quantity > 0;

  IF COALESCE(v_needed, 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'sale_id', p_sale_id, 'reversed_lines', 0, 'skipped', 'no_products');
  END IF;

  SELECT COUNT(DISTINCT sm.product_id)::integer
  INTO v_done
  FROM public.stock_movements sm
  WHERE sm.sale_id = p_sale_id
    AND sm.source = 'void_reversal';

  IF COALESCE(v_done, 0) >= v_needed THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'sale_id', p_sale_id, 'reversed_lines', v_done);
  END IF;

  SELECT s.salon_id
  INTO v_salon_id
  FROM public.sales s
  WHERE s.id = p_sale_id;

  IF NOT FOUND OR v_salon_id IS NULL THEN
    RAISE EXCEPTION 'reverse_sale_stock_for_void: vendita % non trovata', p_sale_id;
  END IF;

  v_group := public.ledger_movement_group_from_text('void-reversal:sale:' || p_sale_id::text);

  FOR v_item IN
    SELECT si.product_id, SUM(si.quantity)::integer AS qty
    FROM public.sale_items si
    WHERE si.sale_id = p_sale_id
      AND si.product_id IS NOT NULL
      AND si.quantity > 0
    GROUP BY si.product_id
  LOOP
    v_line_request_id := public.ledger_movement_group_from_text(
      'void-reversal:sale:' || p_sale_id::text || ':product:' || v_item.product_id::text
    );

    PERFORM public.stock_move(
      p_product_id := v_item.product_id,
      p_qty := v_item.qty,
      p_from_salon := NULL,
      p_to_salon := v_salon_id,
      p_movement_type := 'carico',
      p_reason := 'Storno annullo fiscale vendita #' || p_sale_id,
      p_client_request_id := v_line_request_id,
      p_sale_id := p_sale_id,
      p_created_by := p_actor_id,
      p_movement_group_id := v_group,
      p_source := 'void_reversal'
    );

    v_reversed_lines := v_reversed_lines + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'sale_id', p_sale_id,
    'reversed_lines', v_reversed_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_sale_stock_for_void(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_sale_stock_for_void(bigint, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) close_sale_atomic: pre-validazione giacenza server-side (FOR UPDATE)
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
  v_item record;
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

  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) AS elem
  LOOP
    IF (v_item.elem->>'kind') = 'product' THEN
      v_sale_item_id := NULL;

      SELECT si.id
      INTO v_sale_item_id
      FROM public.sale_items si
      WHERE si.sale_id = v_sale_id
        AND si.product_id = (v_item.elem->>'ref_id')::integer
        AND si.service_id IS NULL
      ORDER BY si.id DESC
      LIMIT 1;

      PERFORM public.stock_move(
        p_product_id := (v_item.elem->>'ref_id')::integer,
        p_qty := (v_item.elem->>'quantity')::integer,
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
    END IF;
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
-- 5) finalize_fiscal_job_atomic: storno stock su void_receipt success
-- ---------------------------------------------------------------------------
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
$$;

REVOKE ALL ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_fiscal_job_atomic(bigint, boolean, text, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) RLS: solo SELECT su product_stock / stock_movements per client
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS product_stock_insert ON public.product_stock;
DROP POLICY IF EXISTS product_stock_update ON public.product_stock;
DROP POLICY IF EXISTS product_stock_delete ON public.product_stock;
DROP POLICY IF EXISTS stock_movements_insert_admin_only ON public.stock_movements;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.product_stock FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.stock_movements FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) movimenti_view: senza ORDER BY (ordinamento in query paginata)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.movimenti_view;

CREATE VIEW public.movimenti_view AS
SELECT
  sm.id,
  sm.created_at,
  sm.product_id,
  p.name AS product_name,
  p.category,
  sm.quantity AS quantity,
  CASE
    WHEN sm.source = 'void_reversal' THEN 'storno'
    WHEN lower(btrim(sm.movement_type)) = 'load' THEN 'carico'
    WHEN lower(btrim(sm.movement_type)) = 'unload' THEN 'scarico'
    WHEN lower(btrim(sm.movement_type)) = 'transfer' THEN 'trasferimento'
    WHEN lower(btrim(sm.movement_type)) = 'sale' THEN 'vendita'
    WHEN lower(btrim(sm.movement_type)) = 'carico' THEN 'carico'
    WHEN lower(btrim(sm.movement_type)) = 'scarico' THEN 'scarico'
    WHEN lower(btrim(sm.movement_type)) = 'trasferimento' THEN 'trasferimento'
    ELSE lower(btrim(sm.movement_type))
  END AS movement_type,
  sm.from_salon,
  sm.to_salon,
  sm.reason
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id;

ALTER VIEW public.movimenti_view SET (security_invoker = true);

GRANT SELECT ON public.movimenti_view TO authenticated;

COMMIT;
