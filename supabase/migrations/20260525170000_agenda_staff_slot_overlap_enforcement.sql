-- P0 Agenda: overlap staff atomico (advisory lock + trigger su appointment_services).

CREATE INDEX IF NOT EXISTS idx_appointment_services_staff_start
  ON public.appointment_services (staff_id, start_time)
  WHERE staff_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_appointment_service_staff_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_salon_id integer;
  v_new_start timestamp;
  v_new_end timestamp;
  v_window_start timestamp;
  v_window_end timestamp;
  v_day_key integer;
  v_staff_int integer;
  v_conflict boolean;
BEGIN
  IF NEW.staff_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.start_time IS NULL
     OR NEW.duration_minutes IS NULL
     OR NEW.duration_minutes <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT a.salon_id
  INTO v_salon_id
  FROM public.appointments a
  WHERE a.id = NEW.appointment_id;

  IF v_salon_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_start := NEW.start_time;
  v_new_end := v_new_start + (NEW.duration_minutes || ' minutes')::interval;

  IF v_new_end <= v_new_start THEN
    RAISE EXCEPTION 'Intervallo orario non valido';
  END IF;

  v_staff_int := NEW.staff_id::integer;
  v_day_key := (
    EXTRACT(YEAR FROM v_new_start)::integer * 10000
    + EXTRACT(MONTH FROM v_new_start)::integer * 100
    + EXTRACT(DAY FROM v_new_start)::integer
  );

  PERFORM pg_advisory_xact_lock(v_staff_int, v_day_key);

  v_window_start := date_trunc('day', v_new_start) - interval '1 day';
  v_window_end := date_trunc('day', v_new_end) + time '23:59:59.999';

  SELECT EXISTS (
    SELECT 1
    FROM public.appointment_services aps
    INNER JOIN public.appointments a ON a.id = aps.appointment_id
    WHERE aps.staff_id = NEW.staff_id
      AND a.salon_id = v_salon_id
      AND aps.start_time >= v_window_start
      AND aps.start_time <= v_window_end
      AND aps.id IS DISTINCT FROM NEW.id
      AND lower(trim(coalesce(a.status, ''))) NOT IN (
        'cancelled',
        'no_show',
        'noshow',
        'done'
      )
      AND aps.start_time < v_new_end
      AND (aps.start_time + (aps.duration_minutes || ' minutes')::interval) > v_new_start
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Collaboratore già impegnato in questa fascia oraria';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_appointment_service_staff_slot() IS
  'Blocca overlap righe agenda per staff/salone; lock transazionale staff+giorno; ignora status terminali.';

DROP TRIGGER IF EXISTS trg_enforce_appointment_service_staff_slot ON public.appointment_services;

CREATE TRIGGER trg_enforce_appointment_service_staff_slot
  BEFORE INSERT OR UPDATE OF staff_id, start_time, duration_minutes
  ON public.appointment_services
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_appointment_service_staff_slot();
