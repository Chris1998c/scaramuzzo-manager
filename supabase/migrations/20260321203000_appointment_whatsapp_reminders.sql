-- Log / idempotenza reminder WhatsApp appuntamenti (transazionale v1).
-- appointments.id è integer (non uuid).

BEGIN;

CREATE TABLE public.appointment_whatsapp_reminders (
  id bigserial PRIMARY KEY,
  appointment_id integer NOT NULL
    REFERENCES public.appointments (id) ON DELETE CASCADE,
  salon_id integer NOT NULL
    REFERENCES public.salons (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL
    REFERENCES public.customers (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz NULL,
  provider_message_id text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_whatsapp_reminders_appointment_id_key UNIQUE (appointment_id)
);

COMMENT ON TABLE public.appointment_whatsapp_reminders IS
  'Un record per appuntamento: reminder WhatsApp v1 (idempotenza su appointment_id).';

ALTER TABLE public.appointment_whatsapp_reminders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.appointment_whatsapp_reminders TO service_role;

-- Solo service_role (cron server-side); nessuna policy per authenticated.

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
  wa_display_name text
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
    COALESCE(ws.display_name, '')
  FROM public.appointments a
  INNER JOIN public.customers c ON c.id = a.customer_id
  INNER JOIN public.salons s ON s.id = a.salon_id
  LEFT JOIN public.salon_whatsapp_settings ws ON ws.salon_id = a.salon_id
  WHERE a.status = 'scheduled'
    AND (a.start_time AT TIME ZONE 'Europe/Rome') >= now() + interval '23 hours'
    AND (a.start_time AT TIME ZONE 'Europe/Rome') <= now() + interval '25 hours';
$$;

COMMENT ON FUNCTION public.appointments_for_whatsapp_reminder_v1 IS
  'Appuntamenti scheduled con inizio tra ~23 e ~25 ore (fuso Europe/Rome).';

REVOKE ALL ON FUNCTION public.appointments_for_whatsapp_reminder_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appointments_for_whatsapp_reminder_v1() TO service_role;

COMMIT;
