-- Storico invii marketing WhatsApp manuale (server-side / service_role).

BEGIN;

CREATE TABLE public.marketing_whatsapp_messages (
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

COMMENT ON TABLE public.marketing_whatsapp_messages IS
  'Log invii manuali WhatsApp marketing per salone; scrittura da API server (service_role).';

CREATE INDEX marketing_whatsapp_messages_salon_created_idx
  ON public.marketing_whatsapp_messages (salon_id, created_at DESC);

ALTER TABLE public.marketing_whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Nessuna policy per authenticated: tutta la lettura via API con supabase_admin (service_role).
GRANT SELECT, INSERT ON public.marketing_whatsapp_messages TO service_role;

COMMIT;
