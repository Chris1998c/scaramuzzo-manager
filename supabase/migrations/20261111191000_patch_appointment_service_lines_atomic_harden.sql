-- Harden patch_appointment_service_lines_atomic:
-- 1) Revoke EXECUTE from PUBLIC/anon/authenticated (default privileges had re-granted them).
-- 2) Apply optional appointment header patch in the same transaction as line updates
--    so a failure leaves both header and service lines unchanged.

DROP FUNCTION IF EXISTS public.patch_appointment_service_lines_atomic(bigint, jsonb);
DROP FUNCTION IF EXISTS public.patch_appointment_service_lines_atomic(bigint, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.patch_appointment_service_lines_atomic(
  p_appointment_id bigint,
  p_lines jsonb,
  p_header jsonb DEFAULT NULL
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

  IF p_header IS NOT NULL THEN
    IF jsonb_typeof(p_header) <> 'object' THEN
      RAISE EXCEPTION 'patch_appointment_service_lines_atomic: p_header deve essere un oggetto';
    END IF;

    UPDATE public.appointments AS a
    SET
      customer_id = CASE
        WHEN p_header ? 'customer_id' THEN NULLIF(p_header->>'customer_id', '')::uuid
        ELSE a.customer_id
      END,
      notes = CASE
        WHEN NOT (p_header ? 'notes') THEN a.notes
        WHEN p_header->'notes' IS NULL OR jsonb_typeof(p_header->'notes') = 'null' THEN NULL
        WHEN NULLIF(p_header->>'notes', '') IS NULL THEN NULL
        ELSE p_header->>'notes'
      END,
      start_time = CASE
        WHEN p_header ? 'start_time' THEN NULLIF(p_header->>'start_time', '')::timestamp without time zone
        ELSE a.start_time
      END,
      end_time = CASE
        WHEN p_header ? 'end_time' THEN NULLIF(p_header->>'end_time', '')::timestamp without time zone
        ELSE a.end_time
      END,
      staff_id = CASE
        WHEN NOT (p_header ? 'staff_id') THEN a.staff_id
        WHEN p_header->'staff_id' IS NULL OR jsonb_typeof(p_header->'staff_id') = 'null' THEN NULL
        ELSE NULLIF(p_header->>'staff_id', '')::integer
      END
    WHERE a.id = p_appointment_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION
        'patch_appointment_service_lines_atomic: header appuntamento % non aggiornato',
        p_appointment_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.patch_appointment_service_lines_atomic(bigint, jsonb, jsonb) IS
  'Aggiorna appointment_services (+ optional header) in una transazione; EXECUTE solo service_role.';
