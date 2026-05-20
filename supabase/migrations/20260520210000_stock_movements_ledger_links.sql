BEGIN;

-- P0: ledger links su stock_movements (additive, no-downtime).

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS sale_id bigint NULL REFERENCES public.sales (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_id bigint NULL REFERENCES public.transfers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_item_id bigint NULL REFERENCES public.sale_items (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_item_id bigint NULL REFERENCES public.transfer_items (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movement_group_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS qty_before numeric NULL,
  ADD COLUMN IF NOT EXISTS qty_after numeric NULL;

UPDATE public.stock_movements
SET source = 'legacy'
WHERE source IS NULL;

ALTER TABLE public.stock_movements
  ALTER COLUMN source SET DEFAULT 'legacy',
  ALTER COLUMN source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_movements_source_check'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
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
          'inventory'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stock_movements_created_at_desc_idx
  ON public.stock_movements (created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_product_created_desc_idx
  ON public.stock_movements (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_from_salon_created_desc_idx
  ON public.stock_movements (from_salon, created_at DESC)
  WHERE from_salon IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_to_salon_created_desc_idx
  ON public.stock_movements (to_salon, created_at DESC)
  WHERE to_salon IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_sale_id_idx
  ON public.stock_movements (sale_id)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_transfer_id_idx
  ON public.stock_movements (transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_movement_group_id_idx
  ON public.stock_movements (movement_group_id)
  WHERE movement_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_created_by_idx
  ON public.stock_movements (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_source_created_desc_idx
  ON public.stock_movements (source, created_at DESC);

-- Gruppo stabile da testo (sale:/transfer:/bulk) per SQL writer/backfill coerente con script TS.
CREATE OR REPLACE FUNCTION public.ledger_movement_group_from_text(p_label text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_hex text;
BEGIN
  IF p_label IS NULL OR btrim(p_label) = '' THEN
    RETURN NULL;
  END IF;

  v_hex := md5('scz-ledger:' || p_label);

  RETURN (
    substr(v_hex, 1, 8) || '-' ||
    substr(v_hex, 9, 4) || '-' ||
    '5' || substr(v_hex, 14, 3) || '-' ||
    substr(v_hex, 17, 4) || '-' ||
    substr(v_hex, 21, 12)
  )::uuid;
END;
$function$;

DROP FUNCTION IF EXISTS public.stock_move(integer, numeric, integer, integer, text, text, uuid);

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
  );

  RETURN jsonb_build_object(
    'ok', true,
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
  integer,
  numeric,
  integer,
  integer,
  text,
  text,
  uuid,
  bigint,
  bigint,
  bigint,
  bigint,
  uuid,
  uuid,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.stock_move(
  integer,
  numeric,
  integer,
  integer,
  text,
  text,
  uuid,
  bigint,
  bigint,
  bigint,
  bigint,
  uuid,
  uuid,
  text
) FROM anon;

REVOKE ALL ON FUNCTION public.stock_move(
  integer,
  numeric,
  integer,
  integer,
  text,
  text,
  uuid,
  bigint,
  bigint,
  bigint,
  bigint,
  uuid,
  uuid,
  text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.stock_move(
  integer,
  numeric,
  integer,
  integer,
  text,
  text,
  uuid,
  bigint,
  bigint,
  bigint,
  bigint,
  uuid,
  uuid,
  text
) TO service_role;

-- close_sale_atomic: pass ledger fields to stock_move
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
          salon_id,
          created_by,
          kind,
          sale_id,
          cash_session_id,
          printer_model,
          printer_serial,
          payload,
          status
        )
        VALUES (
          p_salon_id,
          p_created_by,
          'sale_receipt',
          v_existing_sale_id,
          p_cash_session_id,
          v_printer_model,
          v_printer_serial,
          v_payload,
          'pending'
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

  IF p_fiscal_enabled THEN
    v_fiscal_status := CASE
      WHEN p_fiscal_bridge_reachable THEN 'queued'
      ELSE 'pending'
    END;
  ELSE
    v_fiscal_status := 'not_required';
  END IF;

  INSERT INTO public.sales (
    salon_id,
    customer_id,
    total_amount,
    payment_method,
    discount,
    date,
    idempotency_key,
    cash_session_id,
    fiscal_status
  )
  VALUES (
    p_salon_id,
    p_customer_id,
    p_total_amount,
    p_payment_method,
    COALESCE(p_discount, 0),
    now(),
    CASE WHEN p_appointment_id IS NULL THEN v_idempotency_key ELSE NULL END,
    p_cash_session_id,
    v_fiscal_status
  )
  RETURNING id INTO v_sale_id;

  v_sale_group := public.ledger_movement_group_from_text('sale:' || v_sale_id::text);

  IF p_fiscal_enabled THEN
    v_payload := p_fiscal_payload || jsonb_build_object('sale_id', v_sale_id);
    v_printer_model := NULLIF(btrim(p_fiscal_payload ->> 'printer_model'), '');
    v_printer_serial := NULLIF(btrim(p_fiscal_payload ->> 'printer_serial'), '');

    INSERT INTO public.fiscal_print_jobs (
      salon_id,
      created_by,
      kind,
      sale_id,
      cash_session_id,
      printer_model,
      printer_serial,
      payload,
      status
    )
    VALUES (
      p_salon_id,
      p_created_by,
      'sale_receipt',
      v_sale_id,
      p_cash_session_id,
      v_printer_model,
      v_printer_serial,
      v_payload,
      v_fiscal_status
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
    SET sale_id = v_sale_id,
        status = 'done'
    WHERE a.id = p_appointment_id
      AND a.sale_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'close_sale_atomic: appuntamento % non trovato o già chiuso (righe aggiornate: %)', p_appointment_id, v_updated;
    END IF;
  END IF;

  sale_id := v_sale_id;
  RETURN NEXT;
  RETURN;
END;
$$;

-- execute_transfer: ledger links per riga transfer_items
CREATE OR REPLACE FUNCTION public.execute_transfer(
  p_transfer_id bigint,
  p_actor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_from_int integer;
  v_to_int integer;
  v_done_at timestamp;
  v_status text;
  v_actor uuid;
  v_is_backend boolean;
  v_transfer_client_request_id uuid;
  v_movement_group uuid;
BEGIN
  v_is_backend :=
    coalesce(auth.jwt() ->> 'role', '') = 'service_role';

  IF NOT (
    v_is_backend
    OR public.is_coordinator()
    OR public.is_magazzino()
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_actor := coalesce(p_actor_id, auth.uid());

  SELECT
    t.from_salon,
    t.to_salon,
    t.executed_at,
    t.status,
    t.client_request_id
  INTO
    v_from_int,
    v_to_int,
    v_done_at,
    v_status,
    v_transfer_client_request_id
  FROM public.transfers t
  WHERE t.id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  IF v_done_at IS NOT NULL OR v_status = 'executed' THEN
    RETURN;
  END IF;

  IF v_status <> 'ready' THEN
    RAISE EXCEPTION 'Transfer % must be ready. Current status: %', p_transfer_id, v_status;
  END IF;

  IF v_from_int IS NULL OR v_to_int IS NULL THEN
    RAISE EXCEPTION 'Transfer % has null from_salon/to_salon', p_transfer_id;
  END IF;

  IF v_from_int = v_to_int THEN
    RAISE EXCEPTION 'Transfer % invalid: from_salon = to_salon (%).', p_transfer_id, v_from_int;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.transfer_items ti
    WHERE ti.transfer_id = p_transfer_id
  ) THEN
    RAISE EXCEPTION 'Transfer % has no items', p_transfer_id;
  END IF;

  v_movement_group := coalesce(
    v_transfer_client_request_id,
    public.ledger_movement_group_from_text('transfer:' || p_transfer_id::text)
  );

  PERFORM public.stock_move(
    p_product_id => ti.product_id,
    p_qty => ti.qty::numeric,
    p_from_salon => v_from_int,
    p_to_salon => v_to_int,
    p_movement_type => 'transfer',
    p_reason => 'transfer_id=' || p_transfer_id::text,
    p_transfer_id => p_transfer_id,
    p_transfer_item_id => ti.id,
    p_created_by => v_actor,
    p_movement_group_id => v_movement_group,
    p_source => 'transfer'
  )
  FROM public.transfer_items ti
  WHERE ti.transfer_id = p_transfer_id;

  UPDATE public.transfers
  SET
    executed_at = now(),
    executed_by = v_actor,
    status = 'executed'
  WHERE id = p_transfer_id;
END;
$function$;

COMMIT;
