-- Schema minimo per test isolati mobile_attendance_clock_insert.

CREATE TABLE IF NOT EXISTS public.salons (
  id integer PRIMARY KEY,
  name text NOT NULL DEFAULT 'Salon'
);

CREATE TABLE IF NOT EXISTS public.staff (
  id integer PRIMARY KEY,
  salon_id integer REFERENCES public.salons (id),
  active boolean NOT NULL DEFAULT true,
  mobile_enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id integer NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  salon_id integer NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type = ANY (ARRAY['in'::text, 'out'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  latitude numeric,
  longitude numeric,
  accuracy_m numeric,
  is_mocked boolean NOT NULL DEFAULT false,
  device_id text,
  app_version text
);

CREATE INDEX IF NOT EXISTS attendance_logs_staff_created_at_idx
  ON public.attendance_logs (staff_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
