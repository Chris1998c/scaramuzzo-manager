-- Snapshot durata attiva / posa su appointment_services (nuove prenotazioni).
-- Nullable: righe storiche restano senza snapshot → busy full-duration lato app.
-- Nessun backfill da public.services (il catalogo può essere cambiato dopo la prenotazione).

BEGIN;

ALTER TABLE public.appointment_services
  ADD COLUMN IF NOT EXISTS duration_active integer NULL,
  ADD COLUMN IF NOT EXISTS duration_processing integer NULL,
  ADD COLUMN IF NOT EXISTS need_processing boolean NULL;

COMMENT ON COLUMN public.appointment_services.duration_active IS
  'Snapshot services.duration_active al momento della prenotazione; NULL = riga storica senza snapshot';
COMMENT ON COLUMN public.appointment_services.duration_processing IS
  'Snapshot services.duration_processing (posa) al momento della prenotazione; NULL = storico';
COMMENT ON COLUMN public.appointment_services.need_processing IS
  'Snapshot services.need_processing al momento della prenotazione; NULL = storico';

COMMIT;
