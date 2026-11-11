CREATE OR REPLACE FUNCTION public.execute_transfer(p_transfer_id bigint, p_actor_id uuid DEFAULT NULL::uuid)
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
$function$
;
