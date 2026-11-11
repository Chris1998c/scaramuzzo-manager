-- Schema minimo: due POST booking concorrenti + tabella idempotency (senza auth.users FK).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.salons (
  id integer PRIMARY KEY,
  name text NOT NULL DEFAULT 'Salon'
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY,
  first_name text
);

CREATE TABLE IF NOT EXISTS public.staff (
  id integer PRIMARY KEY,
  salon_id integer REFERENCES public.salons (id),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.appointments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id integer NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers (id),
  staff_id integer,
  start_time timestamp without time zone NOT NULL,
  end_time timestamp without time zone,
  status text NOT NULL DEFAULT 'scheduled',
  source text
);

CREATE TABLE IF NOT EXISTS public.appointment_services (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id bigint NOT NULL REFERENCES public.appointments (id) ON DELETE CASCADE,
  service_id integer NOT NULL,
  staff_id integer NOT NULL,
  start_time timestamp without time zone NOT NULL,
  duration_minutes integer NOT NULL
);

CREATE OR REPLACE FUNCTION public.enforce_slot() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_salon integer;
  v_status text;
  v_end timestamp;
  v_day_key integer;
BEGIN
  SELECT salon_id, status INTO v_salon, v_status
  FROM public.appointments WHERE id = NEW.appointment_id;
  IF v_status IS DISTINCT FROM 'scheduled' THEN
    RETURN NEW;
  END IF;

  -- Stesso serializzazione della production (staff + giorno).
  v_day_key := (
    EXTRACT(YEAR FROM NEW.start_time)::integer * 10000
    + EXTRACT(MONTH FROM NEW.start_time)::integer * 100
    + EXTRACT(DAY FROM NEW.start_time)::integer
  );
  PERFORM pg_advisory_xact_lock(NEW.staff_id::integer, v_day_key);

  v_end := NEW.start_time + make_interval(mins => NEW.duration_minutes);
  IF EXISTS (
    SELECT 1
    FROM public.appointment_services AS s
    JOIN public.appointments AS a ON a.id = s.appointment_id
    WHERE a.salon_id = v_salon
      AND a.status = 'scheduled'
      AND s.staff_id = NEW.staff_id
      AND s.id IS DISTINCT FROM NEW.id
      AND s.start_time < v_end
      AND (s.start_time + make_interval(mins => s.duration_minutes)) > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Collaboratore già impegnato in questa fascia oraria'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_slot ON public.appointment_services;
CREATE TRIGGER trg_slot
  BEFORE INSERT OR UPDATE ON public.appointment_services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot();

CREATE TABLE IF NOT EXISTS public.customer_booking_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  booking_id bigint,
  response jsonb,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'success', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- Simula POST /api/customer/v1/bookings: begin → create → complete (o complete_fail).
CREATE OR REPLACE FUNCTION public.sim_customer_booking_post(
  p_user_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_salon_id integer,
  p_staff_id integer,
  p_start timestamp,
  p_duration_minutes integer DEFAULT 40,
  p_complete_fail boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_record_id uuid;
  v_existing public.customer_booking_idempotency_keys%ROWTYPE;
  v_appt_id bigint;
  v_booking jsonb;
BEGIN
  -- begin idempotency
  BEGIN
    INSERT INTO public.customer_booking_idempotency_keys (
      user_id, customer_id, idempotency_key, request_hash, status
    ) VALUES (
      p_user_id, p_customer_id, p_idempotency_key, p_request_hash, 'processing'
    )
    RETURNING id INTO v_record_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.customer_booking_idempotency_keys
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF v_existing.request_hash IS DISTINCT FROM p_request_hash THEN
      RETURN jsonb_build_object(
        'http_status', 409,
        'error', 'Idempotency-Key già usata con un payload diverso.'
      );
    END IF;

    IF v_existing.status = 'success' AND v_existing.response ? 'booking' THEN
      RETURN jsonb_build_object(
        'http_status', 201,
        'replay', true,
        'booking', v_existing.response->'booking'
      );
    END IF;

    -- processing con booking già agganciato (create ok, complete fallito) → replay
    IF v_existing.status = 'processing' AND v_existing.response ? 'booking' THEN
      UPDATE public.customer_booking_idempotency_keys
      SET status = 'success',
          booking_id = COALESCE(booking_id, (v_existing.response->'booking'->>'id')::bigint)
      WHERE id = v_existing.id;
      RETURN jsonb_build_object(
        'http_status', 201,
        'replay', true,
        'booking', v_existing.response->'booking'
      );
    END IF;

    IF v_existing.status = 'processing' THEN
      RETURN jsonb_build_object(
        'http_status', 409,
        'error', 'Richiesta già in elaborazione. Riprova tra poco.'
      );
    END IF;

    DELETE FROM public.customer_booking_idempotency_keys WHERE id = v_existing.id;
    INSERT INTO public.customer_booking_idempotency_keys (
      user_id, customer_id, idempotency_key, request_hash, status
    ) VALUES (
      p_user_id, p_customer_id, p_idempotency_key, p_request_hash, 'processing'
    )
    RETURNING id INTO v_record_id;
  END;

  -- create appointment + line (con cleanup se overlap)
  BEGIN
    INSERT INTO public.appointments (
      salon_id, customer_id, staff_id, start_time, end_time, status, source
    ) VALUES (
      p_salon_id,
      p_customer_id,
      p_staff_id,
      p_start,
      p_start + make_interval(mins => p_duration_minutes),
      'scheduled',
      'customer_app'
    )
    RETURNING id INTO v_appt_id;

    INSERT INTO public.appointment_services (
      appointment_id, service_id, staff_id, start_time, duration_minutes
    ) VALUES (
      v_appt_id, 1, p_staff_id, p_start, p_duration_minutes
    );
  EXCEPTION WHEN OTHERS THEN
    IF v_appt_id IS NOT NULL THEN
      DELETE FROM public.appointment_services WHERE appointment_id = v_appt_id;
      DELETE FROM public.appointments WHERE id = v_appt_id;
    END IF;
    DELETE FROM public.customer_booking_idempotency_keys WHERE id = v_record_id;
    IF SQLERRM ILIKE '%impegnato%' THEN
      RETURN jsonb_build_object('http_status', 409, 'error', SQLERRM);
    END IF;
    RETURN jsonb_build_object('http_status', 500, 'error', SQLERRM);
  END;

  v_booking := jsonb_build_object(
    'id', v_appt_id,
    'salon_id', p_salon_id,
    'customer_id', p_customer_id,
    'start_time', p_start,
    'status', 'scheduled'
  );

  IF p_complete_fail THEN
    -- Simula create ok + complete fallito: booking_id/response salvati, status resta processing
    UPDATE public.customer_booking_idempotency_keys
    SET booking_id = v_appt_id,
        response = jsonb_build_object('booking', v_booking)
    WHERE id = v_record_id;
    RETURN jsonb_build_object(
      'http_status', 201,
      'complete_failed', true,
      'booking', v_booking
    );
  END IF;

  UPDATE public.customer_booking_idempotency_keys
  SET status = 'success',
      booking_id = v_appt_id,
      response = jsonb_build_object('booking', v_booking)
  WHERE id = v_record_id;

  RETURN jsonb_build_object('http_status', 201, 'booking', v_booking);
END;
$$;
