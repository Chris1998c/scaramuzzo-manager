CREATE OR REPLACE FUNCTION public.reverse_sale_stock_for_void(p_sale_id bigint, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
