-- Cron ogni 15 minuti. La route valida il bearer Vault e non invia
-- nulla finché un cliente non attiva esplicitamente le push sulla PWA.
SELECT cron.schedule(
  'customer_push_reminders_every_15_min',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://manager.scaramuzzo.green/api/cron/customer-push-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'customer_push_cron_bearer' LIMIT 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);
