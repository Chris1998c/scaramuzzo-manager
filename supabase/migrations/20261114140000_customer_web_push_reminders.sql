-- Push PWA per clienti collegati. Endpoint e chiavi sono leggibili solo lato server.
BEGIN;

CREATE TABLE public.customer_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_push_endpoint_https CHECK (endpoint LIKE 'https://%')
);
CREATE INDEX customer_push_subscriptions_customer_idx
  ON public.customer_push_subscriptions(customer_id) WHERE enabled;
ALTER TABLE public.customer_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_push_subscriptions TO service_role;

CREATE TABLE public.appointment_push_deliveries (
  id bigserial PRIMARY KEY,
  appointment_id integer NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.customer_push_subscriptions(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'sent', 'failed', 'expired')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(appointment_id, subscription_id, scheduled_for)
);
ALTER TABLE public.appointment_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointment_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.appointment_push_deliveries TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.appointment_push_deliveries_id_seq TO service_role;

CREATE FUNCTION public.customer_push_config_v1()
RETURNS TABLE (public_key text, private_key text, cron_secret text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'customer_push_vapid_public' LIMIT 1),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'customer_push_vapid_private' LIMIT 1),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'customer_push_cron_bearer' LIMIT 1);
$$;
REVOKE ALL ON FUNCTION public.customer_push_config_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_push_config_v1() TO service_role;

CREATE FUNCTION public.appointments_for_customer_push_v1()
RETURNS TABLE (
  appointment_id integer,
  subscription_id uuid,
  scheduled_for timestamptz,
  salon_name text,
  endpoint text,
  p256dh text,
  auth text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, ps.id, (a.start_time AT TIME ZONE 'Europe/Rome'),
         s.name, ps.endpoint, ps.p256dh, ps.auth
  FROM public.appointments a
  JOIN public.salons s ON s.id = a.salon_id
  JOIN public.customer_push_subscriptions ps ON ps.customer_id = a.customer_id
  JOIN public.customer_auth_links cal
    ON cal.user_id = ps.user_id AND cal.customer_id = ps.customer_id
  WHERE a.status = 'scheduled' AND ps.enabled = true
    AND (a.start_time AT TIME ZONE 'Europe/Rome') BETWEEN now() + interval '23 hours'
                                                       AND now() + interval '25 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.appointment_push_deliveries d
      WHERE d.appointment_id = a.id AND d.subscription_id = ps.id
        AND d.scheduled_for = (a.start_time AT TIME ZONE 'Europe/Rome')
    )
  ORDER BY a.start_time, a.id, ps.id
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.appointments_for_customer_push_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.appointments_for_customer_push_v1() TO service_role;

COMMIT;
