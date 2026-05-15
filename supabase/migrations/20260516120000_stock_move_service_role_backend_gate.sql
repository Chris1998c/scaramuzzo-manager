BEGIN;

-- P0: stock_move invocabile da supabaseAdmin/service_role (close_sale_atomic, API magazzino).
-- EXECUTE resta solo su service_role; il role gate interno è defense-in-depth.
-- server-side APIs must validate actor before calling stock_move

CREATE OR REPLACE FUNCTION public.stock_move(
  p_product_id integer,
  p_qty numeric,
  p_from_salon integer,
  p_to_salon integer,
  p_movement_type text,
  p_reason text DEFAULT NULL::text
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
  v_mt text := lower(coalesce(p_movement_type, ''));
  v_mt_db text;
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

  -- Role gate: staff app (coordinator/magazzino/reception) oppure backend service_role.
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
    NULL; -- trusted backend path (close_sale_atomic, API magazzino via supabaseAdmin)
  ELSIF v_app_role IN ('coordinator', 'magazzino', 'reception') THEN
    NULL; -- app staff (chiamate con JWT utente + EXECUTE service_role proxy)
  ELSE
    RAISE EXCEPTION 'not allowed (app_role=%, jwt_role=%)', coalesce(v_app_role, ''), coalesce(v_jwt_role, '');
  END IF;

  -- reception: solo proprio salone (non applicato al path backend service_role)
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
  END IF;

  IF p_to_salon IS NOT NULL THEN
    INSERT INTO public.product_stock (product_id, salon_id, quantity)
    VALUES (p_product_id, p_to_salon, 0)
    ON CONFLICT (product_id, salon_id) DO NOTHING;
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

  INSERT INTO public.stock_movements (
    product_id,
    from_salon,
    to_salon,
    quantity,
    movement_type,
    reason
  )
  VALUES (
    p_product_id,
    p_from_salon,
    p_to_salon,
    CASE WHEN v_mt IN ('scarico', 'sale') THEN -p_qty ELSE p_qty END,
    v_mt_db,
    p_reason
  );

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', p_product_id,
    'movement_type', v_mt_db,
    'from_salon', p_from_salon,
    'to_salon', p_to_salon,
    'from_qty', v_from_qty,
    'to_qty', v_to_qty
  );
END;
$function$;

COMMENT ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) IS
  'Movimento stock atomico (lock, no negativo, log). server-side APIs must validate actor before calling stock_move; EXECUTE solo service_role.';

REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) TO service_role;

COMMIT;
