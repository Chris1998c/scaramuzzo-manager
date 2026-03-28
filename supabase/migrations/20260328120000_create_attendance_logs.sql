-- Presenze mobile Team App: log semplificati in/out (separati da staff_attendance_logs legacy)

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id integer NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  salon_id integer NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type = ANY (ARRAY['in'::text, 'out'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_logs_staff_created_at_idx
  ON public.attendance_logs (staff_id, created_at DESC);

COMMENT ON TABLE public.attendance_logs IS 'Timbrature in/out per app mobile Team (API /api/mobile/attendance).';
