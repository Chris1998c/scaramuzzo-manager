-- Fix funzioni stock_move / stock_decrease / execute_transfer per usare movement_type inglesi
-- mantenendo compatibilità con input legacy italiani.

BEGIN;

-- 1) stock_move: accetta legacy, ma scrive SEMPRE load/unload/transfer/sale in stock_movements
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
declare
  v_role_name text;
  v_from_qty numeric;
  v_to_qty numeric;
  v_mt text := lower(coalesce(p_movement_type,''));
  v_mt_db text;
begin
  if p_product_id is null then
    raise exception 'p_product_id is required';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'p_qty must be > 0';
  end if;

  -- normalizza movement_type legacy (compatibilità)
  if v_mt = 'transfer' then
    v_mt := 'trasferimento';
  end if;

  if v_mt not in ('carico','scarico','trasferimento','sale') then
    raise exception 'invalid movement_type: %', p_movement_type;
  end if;

  -- mapping finale verso i soli valori consentiti dalla CHECK:
  -- load / unload / transfer / sale
  v_mt_db :=
    case
      when v_mt = 'carico'        then 'load'
      when v_mt = 'scarico'       then 'unload'
      when v_mt = 'trasferimento' then 'transfer'
      when v_mt = 'sale'          then 'sale'
    end;

  -- regole coerenza (manteniamo la logica esistente, basata sul tipo legacy)
  if v_mt = 'carico' then
    if p_to_salon is null then
      raise exception 'carico requires p_to_salon';
    end if;
    p_from_salon := null;

  elsif v_mt in ('scarico','sale') then
    if p_from_salon is null then
      raise exception '% requires p_from_salon', v_mt;
    end if;
    p_to_salon := null;

  elsif v_mt = 'trasferimento' then
    if p_from_salon is null or p_to_salon is null then
      raise exception 'trasferimento requires both p_from_salon and p_to_salon';
    end if;
    if p_from_salon = p_to_salon then
      raise exception 'trasferimento requires different salons';
    end if;
  end if;

  v_role_name := public.current_role_name();
  if v_role_name not in ('coordinator','magazzino','reception') then
    raise exception 'not allowed';
  end if;

  -- reception: solo proprio salone (via can_access_salon)
  if v_role_name = 'reception' then
    if (p_from_salon is not null and not public.can_access_salon(p_from_salon)) then
      raise exception 'reception not allowed for from_salon=%', p_from_salon;
    end if;
    if (p_to_salon is not null and not public.can_access_salon(p_to_salon)) then
      raise exception 'reception not allowed for to_salon=%', p_to_salon;
    end if;
  end if;

  -- LOCK anti race: (product, salon)
  if p_from_salon is not null then
    perform pg_advisory_xact_lock(p_product_id, p_from_salon);
  end if;
  if p_to_salon is not null then
    perform pg_advisory_xact_lock(p_product_id, p_to_salon);
  end if;

  -- assicurati che esista la riga stock per i saloni coinvolti
  if p_from_salon is not null then
    insert into public.product_stock(product_id, salon_id, quantity)
    values (p_product_id, p_from_salon, 0)
    on conflict (product_id, salon_id) do nothing;
  end if;

  if p_to_salon is not null then
    insert into public.product_stock(product_id, salon_id, quantity)
    values (p_product_id, p_to_salon, 0)
    on conflict (product_id, salon_id) do nothing;
  end if;

  -- update stock (logica invariata)
  if v_mt = 'carico' then
    update public.product_stock
    set quantity = quantity + p_qty
    where product_id = p_product_id and salon_id = p_to_salon;

  elsif v_mt in ('scarico','sale') then
    update public.product_stock
    set quantity = quantity - p_qty
    where product_id = p_product_id and salon_id = p_from_salon;

  elsif v_mt = 'trasferimento' then
    update public.product_stock
    set quantity = quantity - p_qty
    where product_id = p_product_id and salon_id = p_from_salon;

    update public.product_stock
    set quantity = quantity + p_qty
    where product_id = p_product_id and salon_id = p_to_salon;
  end if;

  -- blocco stock negativo (solo se c'è from_salon)
  if p_from_salon is not null then
    select quantity into v_from_qty
    from public.product_stock
    where product_id = p_product_id and salon_id = p_from_salon;

    if v_from_qty < 0 then
      raise exception 'negative stock not allowed (product %, salon %, qty %)',
        p_product_id, p_from_salon, v_from_qty;
    end if;
  end if;

  if p_to_salon is not null then
    select quantity into v_to_qty
    from public.product_stock
    where product_id = p_product_id and salon_id = p_to_salon;
  end if;

  -- log movimento: quantity come prima, movement_type SEMPRE inglese
  insert into public.stock_movements(
    product_id,
    from_salon,
    to_salon,
    quantity,
    movement_type,
    reason
  )
  values (
    p_product_id,
    p_from_salon,
    p_to_salon,
    case when v_mt in ('scarico','sale') then -p_qty else p_qty end,
    v_mt_db,
    p_reason
  );

  return jsonb_build_object(
    'ok', true,
    'product_id', p_product_id,
    'movement_type', v_mt_db,
    'from_salon', p_from_salon,
    'to_salon', p_to_salon,
    'from_qty', v_from_qty,
    'to_qty', v_to_qty
  );
end;
$function$;

-- 2) stock_decrease: usa movement_type = 'unload'
CREATE OR REPLACE FUNCTION public.stock_decrease(
  p_salon integer,
  p_product integer,
  p_qty numeric,
  p_reason text DEFAULT 'manual_decrease'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantità non valida';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM product_stock
    WHERE salon_id = p_salon
      AND product_id = p_product
      AND quantity >= p_qty
  ) THEN
    RAISE EXCEPTION 'Giacenza insufficiente';
  END IF;

  UPDATE product_stock
  SET quantity = quantity - p_qty
  WHERE salon_id = p_salon
    AND product_id = p_product;

  INSERT INTO stock_movements (
    product_id,
    from_salon,
    to_salon,
    quantity,
    movement_type,
    reason
  )
  VALUES (
    p_product,
    p_salon,
    NULL,
    -p_qty,
    'unload',
    p_reason
  );
END;
$function$;

-- 5) Opcionale: execute_transfer passa 'transfer' invece di 'trasferimento'
CREATE OR REPLACE FUNCTION public.execute_transfer(p_transfer_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $function$
declare
  v_from_int  integer;
  v_to_int    integer;
  v_done_at   timestamp;
begin
  if not (public.is_coordinator() or public.is_magazzino()) then
    raise exception 'Not allowed';
  end if;

  select from_salon, to_salon, executed_at
    into v_from_int, v_to_int, v_done_at
  from public.transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer % not found', p_transfer_id;
  end if;

  if v_done_at is not null then
    raise exception 'Transfer % already executed at %', p_transfer_id, v_done_at;
  end if;

  if v_from_int is null or v_to_int is null then
    raise exception 'Transfer % has null from_salon/to_salon', p_transfer_id;
  end if;

  if v_from_int = v_to_int then
    raise exception 'Transfer % invalid: from_salon = to_salon (%).', p_transfer_id, v_from_int;
  end if;

  if not exists (select 1 from public.transfer_items where transfer_id = p_transfer_id) then
    raise exception 'Transfer % has no items', p_transfer_id;
  end if;

  -- usa SOLO la stock_move definitiva (lock + no negative + log)
  perform public.stock_move(
    ti.product_id,
    ti.qty::numeric,
    v_from_int,
    v_to_int,
    'transfer',
    'transfer_id=' || p_transfer_id::text
  )
  from public.transfer_items ti
  where ti.transfer_id = p_transfer_id;

  update public.transfers
  set executed_at = now(),
      executed_by = auth.uid()
  where id = p_transfer_id;
end;
$function$;

COMMIT;
