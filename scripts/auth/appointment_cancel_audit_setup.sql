-- Minimal schema for cancel/hard_delete appointment audit RPC tests (isolated Postgres).

DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.users (
  id uuid PRIMARY KEY
);

CREATE TABLE public.salons (
  id integer PRIMARY KEY
);

CREATE TABLE public.appointments (
  id bigint PRIMARY KEY,
  salon_id integer NOT NULL REFERENCES public.salons(id),
  customer_id uuid,
  status text NOT NULL DEFAULT 'scheduled',
  source text,
  sale_id bigint,
  start_time timestamp without time zone,
  end_time timestamp without time zone
);

CREATE TABLE public.appointment_services (
  id bigserial PRIMARY KEY,
  appointment_id bigint NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id integer NOT NULL DEFAULT 1,
  staff_id integer,
  start_time timestamp without time zone,
  duration_minutes integer NOT NULL DEFAULT 30
);

CREATE TABLE public.system_log (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.users(id),
  salon_id integer REFERENCES public.salons(id),
  action text,
  table_name text,
  reference_id text,
  payload jsonb,
  created_at timestamp without time zone DEFAULT (timezone('UTC', now())::timestamp)
);

INSERT INTO public.salons (id) VALUES (1);
INSERT INTO public.users (id) VALUES ('11111111-1111-1111-1111-111111111111');
