-- Phase 0: App Clienti — source customer_app, catalog flag, RLS read-own appointments.
-- Mutazioni booking: fase successiva (API dedicate). Nessun INSERT/UPDATE/DELETE cliente su appointments.

BEGIN;

-- ---------------------------------------------------------------------------
-- A) appointments.source — estende CHECK con 'customer_app'
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('booking', 'walk_in', 'customer_app'));

COMMENT ON COLUMN public.appointments.source IS
  'booking = agenda staff; walk_in = senza appuntamento; customer_app = prenotazione app clienti';

-- ---------------------------------------------------------------------------
-- B) services.visible_in_customer_app
-- ---------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS visible_in_customer_app boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.services.visible_in_customer_app IS
  'Servizio prenotabile dall''app clienti (catalogo self-service).';

UPDATE public.services
SET visible_in_customer_app = COALESCE(visible_in_agenda, false);

-- ---------------------------------------------------------------------------
-- C) RLS: cliente linkato legge solo propri appuntamenti e righe servizio
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS appointments_select_own ON public.appointments;
CREATE POLICY appointments_select_own
  ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_customer_app_user(customer_id));

DROP POLICY IF EXISTS appointment_services_select_own ON public.appointment_services;
CREATE POLICY appointment_services_select_own
  ON public.appointment_services
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments AS a
      WHERE a.id = appointment_services.appointment_id
        AND public.is_customer_app_user(a.customer_id)
    )
  );

COMMIT;
