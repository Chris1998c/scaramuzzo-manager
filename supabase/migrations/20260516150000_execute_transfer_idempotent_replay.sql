BEGIN;

-- Fase 1 idempotenza: replay stesso transfer_id già eseguito = no-op success (no exception).
CREATE OR REPLACE FUNCTION public.execute_transfer(
  p_transfer_id bigint,
  p_actor_id uuid DEFAULT null
)
RETURNS void
LANGUAGE plpgsql
AS $function$
declare
  v_from_int integer;
  v_to_int integer;
  v_done_at timestamp;
  v_status text;
  v_actor uuid;
  v_is_backend boolean;
begin
  v_is_backend :=
    coalesce(auth.jwt() ->> 'role', '') = 'service_role';

  if not (
    v_is_backend
    or public.is_coordinator()
    or public.is_magazzino()
  ) then
    raise exception 'Not allowed';
  end if;

  v_actor := coalesce(
    p_actor_id,
    auth.uid()
  );

  select
    from_salon,
    to_salon,
    executed_at,
    status
  into
    v_from_int,
    v_to_int,
    v_done_at,
    v_status
  from public.transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer % not found', p_transfer_id;
  end if;

  if v_done_at is not null or v_status = 'executed' then
    return;
  end if;

  if v_status <> 'ready' then
    raise exception 'Transfer % must be ready. Current status: %', p_transfer_id, v_status;
  end if;

  if v_from_int is null or v_to_int is null then
    raise exception 'Transfer % has null from_salon/to_salon', p_transfer_id;
  end if;

  if v_from_int = v_to_int then
    raise exception 'Transfer % invalid: from_salon = to_salon (%).', p_transfer_id, v_from_int;
  end if;

  if not exists (
    select 1
    from public.transfer_items
    where transfer_id = p_transfer_id
  ) then
    raise exception 'Transfer % has no items', p_transfer_id;
  end if;

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
  set
    executed_at = now(),
    executed_by = v_actor,
    status = 'executed'
  where id = p_transfer_id;

end;
$function$;

COMMIT;
