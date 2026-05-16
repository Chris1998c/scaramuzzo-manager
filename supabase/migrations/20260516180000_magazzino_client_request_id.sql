BEGIN;

-- Fase 2 idempotenza magazzino: client_request_id + unique parziale (DB source of truth).

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS transfers_client_request_id_unique
  ON public.transfers (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_client_request_id_unique
  ON public.stock_movements (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Pass-through opzionale: API magazzino imposta client_request_id sul movimento loggato.
CREATE OR REPLACE FUNCTION public.stock_move(
  p_product_id integer,
  p_qty numeric,
  p_from_salon integer,
  p_to_salon integer,
  p_movement_type text,
  p_reason text DEFAULT NULL::text,
  p_client_request_id uuid DEFAULT NULL::uuid
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
    reason,
    client_request_id
  )
  VALUES (
    p_product_id,
    p_from_salon,
    p_to_salon,
    CASE WHEN v_mt IN ('scarico', 'sale') THEN -p_qty ELSE p_qty END,
    v_mt_db,
    p_reason,
    p_client_request_id
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

REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text, uuid) TO service_role;

COMMIT;
