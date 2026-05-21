-- Turni staff: fascia oraria opzionale per giorno (compat: NULL = default salone / giornata intera).

BEGIN;

ALTER TABLE public.staff_schedule
  ADD COLUMN IF NOT EXISTS start_time time without time zone NULL,
  ADD COLUMN IF NOT EXISTS end_time time without time zone NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_schedule_time_window_check'
      AND conrelid = 'public.staff_schedule'::regclass
  ) THEN
    ALTER TABLE public.staff_schedule
      ADD CONSTRAINT staff_schedule_time_window_check
      CHECK (
        start_time IS NULL
        OR end_time IS NULL
        OR end_time > start_time
      );
  END IF;
END $$;

COMMENT ON COLUMN public.staff_schedule.start_time IS
  'Inizio turno (ora locale). NULL con end NULL = default griglia salone / giornata intera attiva.';
COMMENT ON COLUMN public.staff_schedule.end_time IS
  'Fine turno (ora locale). NULL con start NULL = default griglia salone.';

COMMIT;
