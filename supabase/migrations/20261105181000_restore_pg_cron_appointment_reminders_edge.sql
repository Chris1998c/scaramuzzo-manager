-- Ripristino idempotente del job pg_cron appointment-reminders.
-- Allineato a 20260402140000_pg_cron_appointment_reminders_edge.sql:
-- URL Edge, Bearer da Vault appointment_reminders_cron_bearer, net.http_post.
-- Non tocca flag salon_whatsapp_settings né altri job cron.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  jid bigint;
  v_bearer_present boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM vault.secrets
    WHERE name = 'appointment_reminders_cron_bearer'
  ) INTO v_bearer_present;

  IF NOT v_bearer_present THEN
    RAISE EXCEPTION
      'Vault secret appointment_reminders_cron_bearer mancante: impossibile ripristinare il job reminder';
  END IF;

  -- Solo questo jobname: nessun impatto su altri cron.
  FOR jid IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'invoke_appointment_reminders_every_15_min'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  PERFORM cron.schedule(
    'invoke_appointment_reminders_every_15_min',
    '*/15 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://jrqhfnvtdaiutquksgxd.supabase.co/functions/v1/appointment-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization',
        'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'appointment_reminders_cron_bearer'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
    $cron$
  );
END;
$$;
