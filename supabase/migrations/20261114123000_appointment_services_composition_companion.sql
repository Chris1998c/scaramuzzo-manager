-- Marca le righe appointment_services aggiunte dalla composizione App Clienti
-- (es. Shampoo companion), così l'Agenda può nasconderle in griglia senza
-- rimuoverle da durata, busy, totale e Cassa.
ALTER TABLE public.appointment_services
  ADD COLUMN IF NOT EXISTS is_customer_composition_companion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointment_services.is_customer_composition_companion IS
  'true = riga aggiunta automaticamente dalla composizione customer app (non selezionabile); nascosta in griglia Agenda, conservata in dati/cassa.';
