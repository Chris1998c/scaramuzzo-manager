-- Ripristino forward: schema WhatsApp + customer claim droppato da 20260516091830_remote_schema.sql
-- Idempotente (IF NOT EXISTS). Non modifica altre tabelle.

BEGIN;

-- ---------------------------------------------------------------------------
-- customers: colonne marketing + customer_code
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_code text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketing_whatsapp_opt_in boolean NOT NULL DEFAULT false;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz NULL;

UPDATE public.customers AS c
SET customer_code = x.code
FROM (
  SELECT
    id,
    'CLI-' || lpad(
      row_number() OVER (ORDER BY created_at ASC NULLS LAST, id ASC)::text,
      6,
      '0'
    ) AS code
  FROM public.customers
  WHERE customer_code IS NULL
) AS x
WHERE c.id = x.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customers WHERE customer_code IS NULL LIMIT 1
  ) THEN
    RAISE NOTICE 'restore_whatsapp: alcuni customers senza customer_code (righe nuove vuote ok finché app assegna CLI-*)';
  ELSE
    ALTER TABLE public.customers
      ALTER COLUMN customer_code SET NOT NULL;
  END IF;
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_customer_code_key'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- salon_whatsapp_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_whatsapp_settings (
  salon_id integer PRIMARY KEY
    REFERENCES public.salons (id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  phone_number_id text NOT NULL DEFAULT '',
  display_phone text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  appointment_reminder_enabled boolean NOT NULL DEFAULT true,
  appointment_reminder_template_name text NULL,
  appointment_reminder_template_lang text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salon_whatsapp_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.salon_whatsapp_settings TO authenticated;
GRANT INSERT, UPDATE ON public.salon_whatsapp_settings TO authenticated;
GRANT ALL ON public.salon_whatsapp_settings TO service_role;

DROP POLICY IF EXISTS salon_whatsapp_settings_select ON public.salon_whatsapp_settings;
CREATE POLICY salon_whatsapp_settings_select
  ON public.salon_whatsapp_settings
  FOR SELECT
  TO authenticated
  USING (public.can_access_salon(salon_id));

DROP POLICY IF EXISTS salon_whatsapp_settings_insert ON public.salon_whatsapp_settings;
CREATE POLICY salon_whatsapp_settings_insert
  ON public.salon_whatsapp_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_coordinator()
    AND public.can_access_salon(salon_id)
  );

DROP POLICY IF EXISTS salon_whatsapp_settings_update ON public.salon_whatsapp_settings;
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

-- ---------------------------------------------------------------------------
-- appointment_whatsapp_reminders (log idempotente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_whatsapp_reminders (
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
  template_name text NULL,
  phone text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_whatsapp_reminders_appointment_id_key UNIQUE (appointment_id)
);

ALTER TABLE public.appointment_whatsapp_reminders
  ADD COLUMN IF NOT EXISTS template_name text NULL;

ALTER TABLE public.appointment_whatsapp_reminders
  ADD COLUMN IF NOT EXISTS phone text NULL;

ALTER TABLE public.appointment_whatsapp_reminders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.appointment_whatsapp_reminders TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_whatsapp_reminders_status_check'
  ) THEN
    ALTER TABLE public.appointment_whatsapp_reminders
      ADD CONSTRAINT appointment_whatsapp_reminders_status_check
      CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- marketing_whatsapp_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_whatsapp_messages (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL
    REFERENCES public.salons (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL
    REFERENCES public.customers (id) ON DELETE CASCADE,
  created_by uuid NULL,
  message_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text NULL,
  error_message text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_whatsapp_messages_salon_created_idx
  ON public.marketing_whatsapp_messages (salon_id, created_at DESC);

ALTER TABLE public.marketing_whatsapp_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.marketing_whatsapp_messages TO service_role;

-- ---------------------------------------------------------------------------
-- customer_auth_links + OTP challenges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_auth_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  link_method text,
  verified_at timestamptz NULL,
  CONSTRAINT customer_auth_links_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE CASCADE,
  CONSTRAINT customer_auth_links_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT customer_auth_links_customer_id_key UNIQUE (customer_id),
  CONSTRAINT customer_auth_links_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.customer_auth_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_auth_links TO service_role;
GRANT SELECT ON TABLE public.customer_auth_links TO authenticated;

DROP POLICY IF EXISTS customer_auth_links_select_own ON public.customer_auth_links;
CREATE POLICY customer_auth_links_select_own
  ON public.customer_auth_links
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.customer_claim_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL
    REFERENCES public.customers (id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_claim_otp_challenges_user_created_idx
  ON public.customer_claim_otp_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_claim_otp_challenges_expires_idx
  ON public.customer_claim_otp_challenges (expires_at);

ALTER TABLE public.customer_claim_otp_challenges ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_claim_otp_challenges TO service_role;

-- ---------------------------------------------------------------------------
-- RPC reminder + helper cliente
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.appointments_for_whatsapp_reminder_v1();

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
  INNER JOIN public.salon_whatsapp_settings ws ON ws.salon_id = a.salon_id
  WHERE a.status = 'scheduled'
    AND ws.is_enabled = true
    AND btrim(ws.phone_number_id) <> ''
    AND COALESCE(ws.appointment_reminder_enabled, true) = true
    AND c.phone IS NOT NULL
    AND btrim(c.phone) <> ''
    AND (a.start_time AT TIME ZONE 'Europe/Rome') >= now() + interval '23 hours'
    AND (a.start_time AT TIME ZONE 'Europe/Rome') <= now() + interval '25 hours'
    AND NOT EXISTS (
      SELECT 1
      FROM public.appointment_whatsapp_reminders r
      WHERE r.appointment_id = a.id
    );
$$;

COMMENT ON FUNCTION public.appointments_for_whatsapp_reminder_v1 IS
  'Appuntamenti scheduled ~23–25h (Europe/Rome), salone WhatsApp configurato, senza log reminder esistente.';

REVOKE ALL ON FUNCTION public.appointments_for_whatsapp_reminder_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appointments_for_whatsapp_reminder_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.is_customer_app_user(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_auth_links AS l
    WHERE l.customer_id = p_customer_id
      AND l.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_customer_app_user(uuid) IS
  'True se auth.uid() ha un link in customer_auth_links verso il dato customer_id.';

GRANT EXECUTE ON FUNCTION public.is_customer_app_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_app_user(uuid) TO anon;

COMMIT;
