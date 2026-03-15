-- RPC: close_sale_atomic
-- Esegue in una sola transazione: insert sales, insert sale_items, scarico stock (stock_move), update appointments.
-- Qualsiasi errore (incl. stock_move) causa rollback totale.
-- p_items: array JSONB [{ "kind": "service"|"product", "ref_id": int, "staff_id": int|null, "quantity": int, "price": numeric, "discount": numeric }, ...]

CREATE OR REPLACE FUNCTION public.close_sale_atomic(
  p_salon_id integer,
  p_customer_id uuid,
  p_total_amount numeric,
  p_payment_method text,
  p_discount numeric,
  p_items jsonb,
  p_appointment_id integer DEFAULT NULL
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
BEGIN
  -- Validazione minima
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

  -- 1) INSERT vendita
  INSERT INTO public.sales (salon_id, customer_id, total_amount, payment_method, discount, date)
  VALUES (p_salon_id, p_customer_id, p_total_amount, p_payment_method, COALESCE(p_discount, 0), now())
  RETURNING id INTO v_sale_id;

  -- 2) INSERT sale_items da p_items
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

  -- 3) Scarico magazzino: per ogni riga product, chiamata a stock_move (stessa transazione)
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

  -- 4) Chiusura appuntamento se richiesto
  IF p_appointment_id IS NOT NULL AND p_appointment_id > 0 THEN
    UPDATE public.appointments
    SET sale_id = v_sale_id, status = 'done'
    WHERE id = p_appointment_id AND sale_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'close_sale_atomic: appuntamento % non trovato o già chiuso (righe aggiornate: %)', p_appointment_id, v_updated;
    END IF;
  END IF;

  -- Ritorno sale_id
  sale_id := v_sale_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.close_sale_atomic(integer, uuid, numeric, text, numeric, jsonb, integer) IS
'Chiusura cassa atomica: insert sales, sale_items, scarico stock (stock_move), update appointment. Rollback totale su errore.';
