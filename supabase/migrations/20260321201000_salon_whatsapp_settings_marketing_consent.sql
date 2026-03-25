-- Impostazioni WhatsApp per salone (senza token Meta in chiaro).
-- Consenso marketing WhatsApp su anagrafica cliente.

BEGIN;

CREATE TABLE public.salon_whatsapp_settings (
  salon_id integer PRIMARY KEY
    REFERENCES public.salons (id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  phone_number_id text NOT NULL DEFAULT '',
  display_phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.salon_whatsapp_settings IS
  'Configurazione canale WhatsApp Cloud API per salone (ID numero Meta; token solo server/env).';

ALTER TABLE public.salon_whatsapp_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.salon_whatsapp_settings TO authenticated;
GRANT INSERT, UPDATE ON public.salon_whatsapp_settings TO authenticated;
GRANT ALL ON public.salon_whatsapp_settings TO service_role;

CREATE POLICY salon_whatsapp_settings_select
  ON public.salon_whatsapp_settings
  FOR SELECT
  TO authenticated
  USING (public.can_access_salon(salon_id));

CREATE POLICY salon_whatsapp_settings_insert
  ON public.salon_whatsapp_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_coordinator()
    AND public.can_access_salon(salon_id)
  );

CREATE POLICY salon_whatsapp_settings_update
  ON public.salon_whatsapp_settings
  FOR UPDATE
  TO authenticated
  USING (
    public.is_coordinator()
    AND public.can_access_salon(salon_id)
  )
  WITH CHECK (
    public.is_coordinator()
    AND public.can_access_salon(salon_id)
  );

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketing_whatsapp_opt_in boolean NOT NULL DEFAULT false;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz NULL;

COMMIT;
