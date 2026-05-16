-- Email contatto collaboratore (opzionale, dominio operativo staff).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.staff.email IS 'Email contatto collaboratore (non è l''account gestionale users).';
