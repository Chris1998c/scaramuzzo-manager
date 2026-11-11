-- Schema minimo + helper per test isolati giorno operativo Rome.

CREATE TABLE IF NOT EXISTS public.sales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id integer NOT NULL DEFAULT 1,
  cash_session_id integer,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash',
  status text NOT NULL DEFAULT 'posted',
  operation_type text NOT NULL DEFAULT 'sale',
  date timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id integer NOT NULL DEFAULT 1,
  session_date date NOT NULL,
  opened_at timestamp without time zone NOT NULL,
  closed_at timestamp without time zone,
  status text NOT NULL DEFAULT 'open'
);

CREATE OR REPLACE FUNCTION public.rome_business_date(p_ts timestamp without time zone)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_ts IS NULL THEN NULL
    ELSE ((p_ts AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome')::date
  END;
$$;
