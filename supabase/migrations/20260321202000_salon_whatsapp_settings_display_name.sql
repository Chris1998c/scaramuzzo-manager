-- Nome visibile cliente (Display Name) per allineamento a WhatsApp Business / Meta.

BEGIN;

ALTER TABLE public.salon_whatsapp_settings
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.salon_whatsapp_settings.display_name IS
  'Nome profilo mostrato alle clienti su WhatsApp (approvazione Meta).';

COMMIT;
