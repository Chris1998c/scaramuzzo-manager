CREATE OR REPLACE FUNCTION public.stock_move(p_product_id integer, p_qty numeric, p_from_salon integer, p_to_salon integer, p_movement_type text, p_reason text DEFAULT NULL::text, p_client_request_id uuid DEFAULT NULL::uuid, p_sale_id bigint DEFAULT NULL::bigint, p_transfer_id bigint DEFAULT NULL::bigint, p_sale_item_id bigint DEFAULT NULL::bigint, p_transfer_item_id bigint DEFAULT NULL::bigint, p_created_by uuid DEFAULT NULL::uuid, p_movement_group_id uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text)
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
$function$
