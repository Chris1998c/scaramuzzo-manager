-- Calendario operativo fase 1: eccezioni salone per data + override disponibilità staff.
-- DML da server actions / service_role (Impostazioni); client authenticated: solo SELECT.

BEGIN;

-- A) Eccezioni salone (apertura straordinaria / chiusura)
CREATE TABLE IF NOT EXISTS public.salon_operational_days (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id bigint NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  operative_date date NOT NULL,
  kind text NOT NULL,
  open_start_time time without time zone NULL,
  open_end_time time without time zone NULL,
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salon_operational_days_kind_check
    CHECK (kind = ANY (ARRAY['open_extra'::text, 'closed'::text])),
  CONSTRAINT salon_operational_days_open_window_check
    CHECK (
      open_start_time IS NULL
      OR open_end_time IS NULL
      OR open_end_time > open_start_time
    ),
  CONSTRAINT salon_operational_days_salon_date_unique
    UNIQUE (salon_id, operative_date)
);

CREATE INDEX IF NOT EXISTS salon_operational_days_salon_date_idx
  ON public.salon_operational_days (salon_id, operative_date);

COMMENT ON TABLE public.salon_operational_days IS
  'Eccezioni calendario salone per data (apertura straordinaria / chiusura). DML via server/admin.';

-- B) Override disponibilità staff per data
CREATE TABLE IF NOT EXISTS public.staff_schedule_date_overrides (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id bigint NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  staff_id bigint NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  operative_date date NOT NULL,
  kind text NOT NULL,
  start_time time without time zone NULL,
  end_time time without time zone NULL,
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_schedule_date_overrides_kind_check
    CHECK (kind = ANY (ARRAY['available'::text, 'unavailable'::text])),
  CONSTRAINT staff_schedule_date_overrides_time_window_check
    CHECK (
      start_time IS NULL
      OR end_time IS NULL
      OR end_time > start_time
    ),
  CONSTRAINT staff_schedule_date_overrides_salon_staff_date_unique
    UNIQUE (salon_id, staff_id, operative_date)
);

CREATE INDEX IF NOT EXISTS staff_schedule_date_overrides_salon_staff_date_idx
  ON public.staff_schedule_date_overrides (salon_id, staff_id, operative_date);

COMMENT ON TABLE public.staff_schedule_date_overrides IS
  'Override disponibilità staff per data/salone. DML via server/admin; enforcement su API agenda.';

-- updated_at
DROP TRIGGER IF EXISTS trg_salon_operational_days_updated_at ON public.salon_operational_days;
CREATE TRIGGER trg_salon_operational_days_updated_at
  BEFORE UPDATE ON public.salon_operational_days
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_schedule_date_overrides_updated_at ON public.staff_schedule_date_overrides;
CREATE TRIGGER trg_staff_schedule_date_overrides_updated_at
  BEFORE UPDATE ON public.staff_schedule_date_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS (stesso modello staff_schedule: SELECT salon, no DML client)
REVOKE ALL ON public.salon_operational_days FROM anon;
REVOKE ALL ON public.staff_schedule_date_overrides FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.salon_operational_days FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.staff_schedule_date_overrides FROM authenticated;

GRANT SELECT ON public.salon_operational_days TO authenticated;
GRANT SELECT ON public.staff_schedule_date_overrides TO authenticated;

ALTER TABLE public.salon_operational_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_schedule_date_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salon_operational_days_select_salon ON public.salon_operational_days;
CREATE POLICY salon_operational_days_select_salon
  ON public.salon_operational_days
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.can_access_salon((salon_id)::integer));

DROP POLICY IF EXISTS staff_schedule_date_overrides_select_salon ON public.staff_schedule_date_overrides;
CREATE POLICY staff_schedule_date_overrides_select_salon
  ON public.staff_schedule_date_overrides
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.can_access_salon((salon_id)::integer));

COMMIT;
