-- Idempotency keys per POST /api/customer/v1/bookings (App Clienti pre-Expo).

BEGIN;

CREATE TABLE public.customer_booking_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  booking_id integer,
  response jsonb,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_booking_idempotency_keys_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT customer_booking_idempotency_keys_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers (id) ON DELETE CASCADE,
  CONSTRAINT customer_booking_idempotency_keys_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.appointments (id) ON DELETE SET NULL,
  CONSTRAINT customer_booking_idempotency_keys_status_check
    CHECK (status IN ('processing', 'success', 'failed')),
  CONSTRAINT customer_booking_idempotency_keys_user_key_unique
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_customer_booking_idempotency_keys_created_at
  ON public.customer_booking_idempotency_keys (created_at);

COMMENT ON TABLE public.customer_booking_idempotency_keys IS
  'Idempotency POST booking App Clienti; scoped per auth user. Solo backend service_role.';

ALTER TABLE public.customer_booking_idempotency_keys ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_booking_idempotency_keys TO service_role;

COMMIT;
