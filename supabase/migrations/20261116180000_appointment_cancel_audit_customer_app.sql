-- P0: soft-cancel customer_app + audit atomico su system_log.
-- Hard delete resta solo per appuntamenti non customer_app (senza sale_id).

CREATE OR REPLACE FUNCTION public.cancel_appointment_with_audit(
  p_appointment_id bigint,
  p_actor_id uuid,
  p_reason text DEFAULT 'staff_cancel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_actor uuid;
BEGIN
  IF p_appointment_id IS NULL OR p_appointment_id <= 0 THEN
    RAISE EXCEPTION 'appointment_id non valido';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_appt.sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sale_locked');
  END IF;

  IF lower(coalesce(v_appt.status, '')) IN ('done', 'cancelled', 'no_show', 'noshow') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'terminal_status',
      'status', v_appt.status
    );
  END IF;

  UPDATE public.appointments
  SET status = 'cancelled'
  WHERE id = p_appointment_id;

  SELECT u.id INTO v_actor
  FROM public.users u
  WHERE u.id = p_actor_id;

  INSERT INTO public.system_log (
    user_id,
    salon_id,
    action,
    table_name,
    reference_id,
    payload,
    created_at
  ) VALUES (
    v_actor,
    v_appt.salon_id,
    'appointment_cancel',
    'appointments',
    p_appointment_id::text,
    jsonb_build_object(
      'reason', coalesce(nullif(btrim(p_reason), ''), 'staff_cancel'),
      'source', v_appt.source,
      'previous_status', v_appt.status,
      'actor_id', p_actor_id
    ),
    timezone('UTC', now())::timestamp
  );

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', p_appointment_id,
    'status', 'cancelled'
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) IS
  'Soft-cancel appointment + system_log in one transaction (P0 customer_app integrity).';

REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.hard_delete_appointment_with_audit(
  p_appointment_id bigint,
  p_actor_id uuid,
  p_reason text DEFAULT 'staff_hard_delete'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_actor uuid;
BEGIN
  IF p_appointment_id IS NULL OR p_appointment_id <= 0 THEN
    RAISE EXCEPTION 'appointment_id non valido';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- customer_app: never hard-delete (use cancel_appointment_with_audit).
  IF lower(coalesce(v_appt.source, '')) = 'customer_app' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'customer_app_no_hard_delete');
  END IF;

  IF v_appt.sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sale_locked');
  END IF;

  IF lower(coalesce(v_appt.status, '')) IN ('done', 'in_sala') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'terminal_status', 'status', v_appt.status);
  END IF;

  SELECT u.id INTO v_actor
  FROM public.users u
  WHERE u.id = p_actor_id;

  INSERT INTO public.system_log (
    user_id,
    salon_id,
    action,
    table_name,
    reference_id,
    payload,
    created_at
  ) VALUES (
    v_actor,
    v_appt.salon_id,
    'appointment_hard_delete',
    'appointments',
    p_appointment_id::text,
    jsonb_build_object(
      'reason', coalesce(nullif(btrim(p_reason), ''), 'staff_hard_delete'),
      'source', v_appt.source,
      'previous_status', v_appt.status,
      'actor_id', p_actor_id
    ),
    timezone('UTC', now())::timestamp
  );

  DELETE FROM public.appointment_services WHERE appointment_id = p_appointment_id;
  DELETE FROM public.appointments WHERE id = p_appointment_id;

  RETURN jsonb_build_object('ok', true, 'appointment_id', p_appointment_id, 'deleted', true);
END;
$$;

COMMENT ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) IS
  'Hard-delete non-customer_app appointment + system_log; blocks customer_app.';

REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) TO service_role;
