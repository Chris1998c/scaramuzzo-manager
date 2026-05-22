-- Storico heartbeat bridge (enterprise monitoring). Purge opzionale in futuro.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bridge_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_installation_id uuid NOT NULL
    REFERENCES public.bridge_installations (id) ON DELETE CASCADE,
  salon_id integer NOT NULL REFERENCES public.salons (id) ON DELETE RESTRICT,
  bridge_id text NOT NULL,
  status text NULL,
  version text NULL,
  health jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bridge_heartbeats IS
  'Log heartbeat bridge (sanitized). last_health su bridge_installations resta la vista corrente.';

CREATE INDEX IF NOT EXISTS bridge_heartbeats_installation_created_idx
  ON public.bridge_heartbeats (bridge_installation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bridge_heartbeats_salon_created_idx
  ON public.bridge_heartbeats (salon_id, created_at DESC);

ALTER TABLE public.bridge_heartbeats ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.bridge_heartbeats TO service_role;

COMMIT;
