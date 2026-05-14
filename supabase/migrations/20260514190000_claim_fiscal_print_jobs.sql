BEGIN;

-- Colonne per lock e metriche claim (attempts solo in claim, non in finalize).
ALTER TABLE public.fiscal_print_jobs
  ADD COLUMN IF NOT EXISTS locked_by text NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- Stato intermedio atomico worker: pending -> processing -> completed|failed
ALTER TABLE public.fiscal_print_jobs
  DROP CONSTRAINT IF EXISTS fiscal_print_jobs_status_check;

ALTER TABLE public.fiscal_print_jobs
  ADD CONSTRAINT fiscal_print_jobs_status_check
  CHECK (
    status IN (
      'pending',
      'processing',
      'queued',
      'completed',
      'failed',
      'cancelled'
    )
  );

CREATE INDEX IF NOT EXISTS fiscal_print_jobs_pending_created_at_idx
  ON public.fiscal_print_jobs (created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_fiscal_print_jobs(
  p_bridge_id text,
  p_limit integer DEFAULT 1
)
RETURNS SETOF public.fiscal_print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
BEGIN
  IF p_bridge_id IS NULL OR length(trim(p_bridge_id)) = 0 THEN
    RAISE EXCEPTION 'claim_fiscal_print_jobs: p_bridge_id richiesto';
  END IF;

  v_limit := coalesce(p_limit, 1);
  IF v_limit < 1 OR v_limit > 50 THEN
    RAISE EXCEPTION 'claim_fiscal_print_jobs: p_limit deve essere tra 1 e 50';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.fiscal_print_jobs AS j
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.fiscal_print_jobs AS u
  SET
    status = 'processing',
    locked_by = trim(p_bridge_id),
    locked_at = now(),
    attempts = coalesce(u.attempts, 0) + 1
  FROM picked
  WHERE u.id = picked.id
  RETURNING u.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fiscal_print_jobs(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_fiscal_print_jobs(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_fiscal_print_jobs(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fiscal_print_jobs(text, integer) TO service_role;

COMMIT;
