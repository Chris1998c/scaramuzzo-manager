BEGIN;

-- P0: harden firma (bigint, uuid), grant solo service_role, anti-spoof p_actor_id.
CREATE OR REPLACE FUNCTION public.execute_transfer(
  p_transfer_id bigint,
  p_actor_id uuid DEFAULT null
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

  IF v_is_backend THEN
    v_actor := coalesce(p_actor_id, auth.uid());
  ELSE
    v_actor := auth.uid();
  END IF;

  SELECT
    from_salon,
    to_salon,
    executed_at,
    status
  INTO
    v_from_int,
    v_to_int,
    v_done_at,
    v_status
  FROM public.transfers
  WHERE id = p_transfer_id
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
    FROM public.transfer_items
    WHERE transfer_id = p_transfer_id
  ) THEN
    RAISE EXCEPTION 'Transfer % has no items', p_transfer_id;
  END IF;

  PERFORM public.stock_move(
    ti.product_id,
    ti.qty::numeric,
    v_from_int,
    v_to_int,
    'transfer',
    'transfer_id=' || p_transfer_id::text
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

REVOKE ALL ON FUNCTION public.execute_transfer(bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_transfer(bigint, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.execute_transfer(bigint, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_transfer(bigint, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.execute_transfer(bigint);

COMMIT;
