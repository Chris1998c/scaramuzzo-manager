-- Delivery status (webhook Meta) + retry controllato su appointment_whatsapp_reminders.
-- Non modifica flag salon_whatsapp_settings. Non applicare automaticamente in questo task.

BEGIN;

ALTER TABLE public.appointment_whatsapp_reminders
  ADD COLUMN IF NOT EXISTS delivery_status text NULL,
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS delivery_error text NULL,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS retryable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.appointment_whatsapp_reminders.status IS
  'Esito accettazione Graph: pending|sent|failed|skipped';
COMMENT ON COLUMN public.appointment_whatsapp_reminders.delivery_status IS
  'Esito consegna Meta (webhook): sent|delivered|read|failed; NULL = non ancora notificato';
COMMENT ON COLUMN public.appointment_whatsapp_reminders.retryable IS
  'true solo se failed recuperabile e senza provider_message_id (niente doppio invio ambiguo)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_whatsapp_reminders_delivery_status_check'
  ) THEN
    ALTER TABLE public.appointment_whatsapp_reminders
      ADD CONSTRAINT appointment_whatsapp_reminders_delivery_status_check
      CHECK (
        delivery_status IS NULL
        OR delivery_status IN ('sent', 'delivered', 'read', 'failed')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointment_whatsapp_reminders_provider_message_id_idx
  ON public.appointment_whatsapp_reminders (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointment_whatsapp_reminders_retry_due_idx
  ON public.appointment_whatsapp_reminders (next_retry_at)
  WHERE retryable = true AND status = 'failed';

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id bigserial PRIMARY KEY,
  provider_message_id text NOT NULL,
  delivery_status text NOT NULL,
  provider_timestamp text NOT NULL DEFAULT '',
  error_message text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_webhook_events_delivery_status_check
    CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed')),
  CONSTRAINT whatsapp_webhook_events_dedupe_key
    UNIQUE (provider_message_id, delivery_status, provider_timestamp)
);

COMMENT ON TABLE public.whatsapp_webhook_events IS
  'Dedupe webhook Meta; conserva anche eventi early (prima del provider_message_id sul reminder) per replay';

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Solo service_role (webhook/cron). Nessuna policy per authenticated/anon.
GRANT SELECT, INSERT ON public.whatsapp_webhook_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.whatsapp_webhook_events_id_seq TO service_role;

-- Compat: colonne retry già con DEFAULT → insert reminder pre-migrazione senza campi restano validi post-migrazione.
ALTER TABLE public.appointment_whatsapp_reminders
  ALTER COLUMN retry_count SET DEFAULT 0,
  ALTER COLUMN retryable SET DEFAULT false;

COMMIT;
