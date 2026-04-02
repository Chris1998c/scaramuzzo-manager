-- Appointment reminders: trigger Edge Function ogni 15 min (pg_cron + pg_net + Vault).
-- Sostituire <PROJECT_REF> con il ref del progetto Supabase (Settings → General → Reference ID).
--
-- PASSI MANUALI (una tantum, prima che il cron sia utile):
-- 1) Stesso segreto usato per CRON_SECRET sulla Edge Function e come Bearer da pg_net:
--    SQL Editor (postgres):
--    SELECT vault.create_secret(
--      '<CRON_SECRET_VALUE>',
--      'appointment_reminders_cron_bearer',
--      'Bearer per pg_net → functions/v1/appointment-reminders'
--    );
-- 2) Deploy function:
--    supabase functions deploy appointment-reminders --no-verify-jwt
-- 3) Dashboard → Edge Functions → Secrets: CRON_SECRET, WHATSAPP_* (come su Vercel).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- Vault: su Supabase hosted usa vault.create_secret + vault.decrypted_secrets (estensione già gestita dalla piattaforma).

-- Rimuovi job precedente con stesso nome (idempotente).
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'invoke_appointment_reminders_every_15_min';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END;
$$;

SELECT cron.schedule(
  'invoke_appointment_reminders_every_15_min',
  '*/15 * * * *',
  $$
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
  $$
);
