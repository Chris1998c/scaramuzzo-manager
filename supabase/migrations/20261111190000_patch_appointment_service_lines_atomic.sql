-- Aggiornamento atomico di più appointment_services (staff/start_time) sullo stesso appuntamento.
-- I controlli di disponibilità restano nel layer API; questa RPC garantisce all-or-nothing in scrittura.

CREATE OR REPLACE FUNCTION public.patch_appointment_service_lines_atomic(
  p_appointment_id bigint,
  p_lines jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_line_id bigint;
  v_updated int;
  v_has_start boolean;
  v_has_staff boolean;
BEGIN
  IF p_appointment_id IS NULL OR p_appointment_id <= 0 THEN
    RAISE EXCEPTION 'patch_appointment_service_lines_atomic: appointment_id non valido';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'patch_appointment_service_lines_atomic: p_lines deve essere un array non vuoto';
  END IF;

  PERFORM 1
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'patch_appointment_service_lines_atomic: appuntamento % non trovato',
      p_appointment_id;
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF jsonb_typeof(r) <> 'object' THEN
      RAISE EXCEPTION 'patch_appointment_service_lines_atomic: elemento p_lines non oggetto';
    END IF;

    v_line_id := NULLIF(r->>'id', '')::bigint;
    IF v_line_id IS NULL OR v_line_id <= 0 THEN
      RAISE EXCEPTION 'patch_appointment_service_lines_atomic: id riga non valido';
    END IF;

    v_has_start := (r ? 'start_time');
    v_has_staff := (r ? 'staff_id');

    IF NOT v_has_start AND NOT v_has_staff THEN
      RAISE EXCEPTION
        'patch_appointment_service_lines_atomic: riga % senza start_time né staff_id',
        v_line_id;
    END IF;

    UPDATE public.appointment_services AS s
    SET
      start_time = CASE
        WHEN v_has_start THEN NULLIF(r->>'start_time', '')::timestamp without time zone
        ELSE s.start_time
      END,
      staff_id = CASE
        WHEN NOT v_has_staff THEN s.staff_id
        WHEN r->'staff_id' IS NULL OR jsonb_typeof(r->'staff_id') = 'null' THEN NULL
        ELSE NULLIF(r->>'staff_id', '')::bigint
      END
    WHERE s.id = v_line_id
      AND s.appointment_id = p_appointment_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION
        'patch_appointment_service_lines_atomic: riga % non trovata sull''appuntamento %',
        v_line_id,
        p_appointment_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb) TO service_role;

COMMENT ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb) IS
  'Aggiorna più appointment_services (start_time/staff_id) in una sola transazione; lock appuntamento FOR UPDATE.';
