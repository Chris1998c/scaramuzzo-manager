-- Walk-in appointments: source, check-in time, creator
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'booking',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamp without time zone,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('booking', 'walk_in'));

COMMENT ON COLUMN public.appointments.source IS 'booking = agenda; walk_in = cliente senza appuntamento';
COMMENT ON COLUMN public.appointments.checked_in_at IS 'Porta in sala / walk-in check-in (Europe/Rome wall clock, no TZ)';
COMMENT ON COLUMN public.appointments.created_by IS 'Utente gestionale che ha creato walk-in o check-in';
