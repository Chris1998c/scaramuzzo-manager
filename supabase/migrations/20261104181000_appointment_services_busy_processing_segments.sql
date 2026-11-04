-- Occupazione staff a segmenti: posa libera se snapshot valido su appointment_services.
-- Allineato a resolveAppointmentServiceOccupancyIntervals (TS).
-- Righe sorelle stesso appointment_id restano confrontate (solo aps.id IS DISTINCT FROM NEW.id).
-- Nessun db push: migration locale.

BEGIN;

CREATE OR REPLACE FUNCTION public.appointment_service_busy_ranges(
  p_start timestamp without time zone,
  p_duration integer,
  p_active integer,
  p_processing integer,
  p_need_processing boolean
)
RETURNS TABLE(seg_start timestamp without time zone, seg_end timestamp without time zone)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_valid boolean;
BEGIN
  IF p_start IS NULL OR p_duration IS NULL OR p_duration <= 0 THEN
    RETURN;
  END IF;

  v_valid :=
    coalesce(p_need_processing, false)
    AND p_active IS NOT NULL AND p_active > 0
    AND p_processing IS NOT NULL AND p_processing > 0
    AND (p_active + p_processing) <= p_duration;

  IF NOT v_valid THEN
    seg_start := p_start;
    seg_end := p_start + (p_duration || ' minutes')::interval;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Attivo
  seg_start := p_start;
  seg_end := p_start + (p_active || ' minutes')::interval;
  RETURN NEXT;

  -- Coda oltre active+processing (se presente)
  IF (p_active + p_processing) < p_duration THEN
    seg_start := p_start + ((p_active + p_processing) || ' minutes')::interval;
    seg_end := p_start + (p_duration || ' minutes')::interval;
    RETURN NEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.appointment_service_busy_ranges(timestamp, integer, integer, integer, boolean) IS
  'Segmenti busy [start,end) per riga agenda; posa valida → buco libero tra attivo e coda.';

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
    CROSS JOIN LATERAL public.appointment_service_busy_ranges(
      NEW.start_time,
      NEW.duration_minutes,
      NEW.duration_active,
      NEW.duration_processing,
      NEW.need_processing
    ) AS nb
    CROSS JOIN LATERAL public.appointment_service_busy_ranges(
      aps.start_time,
      aps.duration_minutes,
      aps.duration_active,
      aps.duration_processing,
      aps.need_processing
    ) AS ob
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
      AND nb.seg_start < ob.seg_end
      AND ob.seg_start < nb.seg_end
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'Collaboratore già impegnato in questa fascia oraria';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_appointment_service_staff_slot() IS
  'Blocca overlap busy staff/salone (posa libera se snapshot valido); lock staff+giorno; sorelle confrontate per id.';

DROP TRIGGER IF EXISTS trg_enforce_appointment_service_staff_slot ON public.appointment_services;

CREATE TRIGGER trg_enforce_appointment_service_staff_slot
  BEFORE INSERT OR UPDATE OF staff_id, start_time, duration_minutes,
    duration_active, duration_processing, need_processing
  ON public.appointment_services
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_appointment_service_staff_slot();

COMMIT;
