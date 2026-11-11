CREATE OR REPLACE FUNCTION public.create_and_execute_transfer(p_from_salon integer, p_to_salon integer, p_items jsonb, p_client_request_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_date date DEFAULT NULL::date, p_causale text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_execute_now boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
