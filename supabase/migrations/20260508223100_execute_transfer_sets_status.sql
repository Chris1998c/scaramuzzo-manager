BEGIN;

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
      executed_by = auth.uid(),
      status = 'executed'
  where id = p_transfer_id;
end;
$function$;

COMMIT;
