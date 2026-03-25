-- Reminder appuntamenti WhatsApp: config per salone (template Meta + toggle), nessuna nuova tabella.

BEGIN;

ALTER TABLE public.salon_whatsapp_settings
  ADD COLUMN IF NOT EXISTS appointment_reminder_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.salon_whatsapp_settings
  ADD COLUMN IF NOT EXISTS appointment_reminder_template_name text NULL;

ALTER TABLE public.salon_whatsapp_settings
  ADD COLUMN IF NOT EXISTS appointment_reminder_template_lang text NULL;

COMMENT ON COLUMN public.salon_whatsapp_settings.appointment_reminder_enabled IS
  'Se false, nessun reminder automatico per questo salone (canale WhatsApp può restare attivo).';

COMMENT ON COLUMN public.salon_whatsapp_settings.appointment_reminder_template_name IS
  'Nome template Meta per reminder; NULL = usa env WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_NAME.';

COMMENT ON COLUMN public.salon_whatsapp_settings.appointment_reminder_template_lang IS
  'Codice lingua template (es. it); NULL = usa env WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_LANG.';

CREATE OR REPLACE FUNCTION public.appointments_for_whatsapp_reminder_v1()
RETURNS TABLE (
  appointment_id integer,
  salon_id integer,
  customer_id uuid,
  customer_phone text,
  customer_first_name text,
  appointment_starts_at timestamptz,
  salon_name text,
  wa_phone_number_id text,
  wa_is_enabled boolean,
  wa_display_name text,
  appointment_reminder_template_name text,
  appointment_reminder_template_lang text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.salon_id,
    a.customer_id,
    c.phone,
    c.first_name,
    (a.start_time AT TIME ZONE 'Europe/Rome'),
    s.name,
    COALESCE(ws.phone_number_id, ''),
    COALESCE(ws.is_enabled, false),
    COALESCE(ws.display_name, ''),
    ws.appointment_reminder_template_name,
    ws.appointment_reminder_template_lang
  FROM public.appointments a
  INNER JOIN public.customers c ON c.id = a.customer_id
  INNER JOIN public.salons s ON s.id = a.salon_id
  LEFT JOIN public.salon_whatsapp_settings ws ON ws.salon_id = a.salon_id
  WHERE a.status = 'scheduled'
    AND COALESCE(ws.appointment_reminder_enabled, true) = true
    AND (a.start_time AT TIME ZONE 'Europe/Rome') >= now() + interval '23 hours'
    AND (a.start_time AT TIME ZONE 'Europe/Rome') <= now() + interval '25 hours';
$$;

COMMENT ON FUNCTION public.appointments_for_whatsapp_reminder_v1 IS
  'Appuntamenti scheduled ~23–25h (Europe/Rome), solo saloni con reminder abilitato; include override template per salone.';

COMMIT;
