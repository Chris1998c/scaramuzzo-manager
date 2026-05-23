-- Team App presenze: audit GPS e device su attendance_logs (P0 Fase 0).

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS accuracy_m numeric,
  ADD COLUMN IF NOT EXISTS is_mocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS app_version text;

COMMENT ON COLUMN public.attendance_logs.latitude IS 'Latitudine GPS al momento della timbratura.';
COMMENT ON COLUMN public.attendance_logs.longitude IS 'Longitudine GPS al momento della timbratura.';
COMMENT ON COLUMN public.attendance_logs.accuracy_m IS 'Accuratezza GPS in metri (radius).';
COMMENT ON COLUMN public.attendance_logs.is_mocked IS 'True se il client segnala posizione simulata.';
COMMENT ON COLUMN public.attendance_logs.device_id IS 'Identificativo device opzionale dal client.';
COMMENT ON COLUMN public.attendance_logs.app_version IS 'Versione app Team al momento della timbratura.';
