-- Challenge OTP per collegamento account ↔ cliente (WhatsApp / template authentication).
-- Solo service_role (API Next con chiave servizio); nessuna policy RLS per authenticated.

BEGIN;

CREATE TABLE public.customer_claim_otp_challenges (
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

CREATE INDEX customer_claim_otp_challenges_user_created_idx
  ON public.customer_claim_otp_challenges (user_id, created_at DESC);

CREATE INDEX customer_claim_otp_challenges_expires_idx
  ON public.customer_claim_otp_challenges (expires_at);

COMMENT ON TABLE public.customer_claim_otp_challenges IS
  'OTP monouso per verifica possesso numero cliente prima di INSERT su customer_auth_links.';

ALTER TABLE public.customer_claim_otp_challenges ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_claim_otp_challenges TO service_role;

COMMIT;
