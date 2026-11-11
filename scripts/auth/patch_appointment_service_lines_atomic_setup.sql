-- Minimal schema for isolated atomic multi-line appointment patch tests.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.appointments (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  salon_id integer,
  start_time timestamp without time zone NOT NULL,
  end_time timestamp without time zone,
  status text DEFAULT 'scheduled',
  sale_id bigint,
  staff_id integer
);

CREATE TABLE public.appointment_services (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  appointment_id bigint NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id bigint NOT NULL DEFAULT 1,
  staff_id bigint,
  start_time timestamp without time zone NOT NULL,
  duration_minutes integer NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 22,
  duration_active integer NULL,
  duration_processing integer NULL,
  need_processing boolean NULL
);

CREATE INDEX appointment_services_appointment_id_idx
  ON public.appointment_services (appointment_id);
