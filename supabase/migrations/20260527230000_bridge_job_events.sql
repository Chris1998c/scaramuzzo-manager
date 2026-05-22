-- Audit trail operazioni fiscal job via bridge token (Manager proxy).

BEGIN;

CREATE TABLE IF NOT EXISTS public.bridge_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_installation_id uuid NOT NULL REFERENCES public.bridge_installations (id) ON DELETE CASCADE,
  bridge_id text NOT NULL,
  salon_id integer NOT NULL REFERENCES public.salons (id) ON DELETE RESTRICT,
  job_id bigint NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_job_events_action_check CHECK (
    action IN (
      'claim',
      'finalize_success',
      'finalize_failed',
      'requeue',
      'reconcile'
    )
  ),
  CONSTRAINT bridge_job_events_salon_id_check CHECK (salon_id BETWEEN 1 AND 4)
);

COMMENT ON TABLE public.bridge_job_events IS
  'Eventi claim/finalize/requeue eseguiti dal Print Bridge via Manager API (no service role su PC).';

CREATE INDEX IF NOT EXISTS bridge_job_events_installation_created_idx
  ON public.bridge_job_events (bridge_installation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bridge_job_events_job_created_idx
  ON public.bridge_job_events (job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

ALTER TABLE public.bridge_job_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.bridge_job_events TO service_role;

COMMIT;
