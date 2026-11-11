-- Timbratura mobile atomica: un solo insert per staff sotto advisory lock,
-- con rifiuto se l'ultima timbratura è troppo recente (anti double-tap / retry).
-- EXECUTE solo service_role (niente PostgREST da anon/authenticated).

CREATE OR REPLACE FUNCTION public.mobile_attendance_clock_insert(
  p_staff_id integer,
  p_salon_id integer,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_min_interval_seconds integer DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_type text;
  v_last_at timestamptz;
  v_new_type text;
  v_log_id bigint;
  v_min_interval integer;
BEGIN
  IF p_staff_id IS NULL OR p_staff_id <= 0 THEN
    RAISE EXCEPTION 'mobile_attendance_clock_insert: staff_id non valido';
  END IF;
  IF p_salon_id IS NULL OR p_salon_id <= 0 THEN
    RAISE EXCEPTION 'mobile_attendance_clock_insert: salon_id non valido';
  END IF;

  v_min_interval := COALESCE(p_min_interval_seconds, 15);
  IF v_min_interval < 0 THEN
    v_min_interval := 0;
  END IF;

  -- Namespace fisso + staff_id: serializza le timbrature dello stesso collaboratore.
  PERFORM pg_advisory_xact_lock(87231401, p_staff_id);

  SELECT l.type, l.created_at
  INTO v_last_type, v_last_at
  FROM public.attendance_logs AS l
  WHERE l.staff_id = p_staff_id
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT 1;

  IF v_last_at IS NOT NULL
     AND v_min_interval > 0
     AND v_last_at > (now() - make_interval(secs => v_min_interval)) THEN
    RAISE EXCEPTION 'mobile_attendance_clock_insert: troppo presto (too_soon)'
      USING ERRCODE = 'P0001';
  END IF;

  v_new_type := CASE WHEN v_last_type = 'in' THEN 'out' ELSE 'in' END;

  INSERT INTO public.attendance_logs (
    staff_id,
    salon_id,
    type,
    latitude,
    longitude,
    accuracy_m,
    is_mocked,
    device_id,
    app_version
  ) VALUES (
    p_staff_id,
    p_salon_id,
    v_new_type,
    p_latitude,
    p_longitude,
    p_accuracy_m,
    false,
    NULLIF(btrim(p_device_id), ''),
    NULLIF(btrim(p_app_version), '')
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'new_status', v_new_type,
    'log_id', v_log_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_attendance_clock_insert(
  integer, integer, numeric, numeric, numeric, text, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mobile_attendance_clock_insert(
  integer, integer, numeric, numeric, numeric, text, text, integer
) FROM anon;
REVOKE ALL ON FUNCTION public.mobile_attendance_clock_insert(
  integer, integer, numeric, numeric, numeric, text, text, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_attendance_clock_insert(
  integer, integer, numeric, numeric, numeric, text, text, integer
) TO service_role;

COMMENT ON FUNCTION public.mobile_attendance_clock_insert(
  integer, integer, numeric, numeric, numeric, text, text, integer
) IS
  'Insert atomico attendance_logs (in/out) con advisory lock; EXECUTE solo service_role.';
