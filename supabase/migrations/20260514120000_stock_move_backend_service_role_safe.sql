-- stock_move: consentire backend (current_role_name vuoto o 'service_role') + ruoli app.
-- EXECUTE resta solo su service_role (REVOKE sotto); close_sale_atomic + API magazzino usano supabaseAdmin.

BEGIN;

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

  -- Ruoli: app (DB/JWT) + service_role da supabaseAdmin; null/vuoto consentito (EXECUTE solo service_role).
  v_role_name := nullif(trim(coalesce(public.current_role_name(), '')), '');

  if v_role_name is not null and v_role_name not in ('coordinator', 'magazzino', 'reception', 'service_role') then
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

REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) TO service_role;

COMMIT;
