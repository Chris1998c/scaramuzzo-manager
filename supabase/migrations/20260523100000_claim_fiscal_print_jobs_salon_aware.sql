-- Claim fiscal jobs per salone (4 Print Bridge locali).
-- Retrocompat: p_salon_id NULL = coda globale come prima.

BEGIN;

CREATE INDEX IF NOT EXISTS fiscal_print_jobs_pending_salon_created_at_idx
  ON public.fiscal_print_jobs (salon_id, created_at)
  WHERE status = 'pending';

DROP FUNCTION IF EXISTS public.claim_fiscal_print_jobs(text, integer);

CREATE OR REPLACE FUNCTION public.claim_fiscal_print_jobs(
  p_bridge_id text,
  p_limit integer DEFAULT 1,
  p_salon_id integer DEFAULT NULL
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
      AND (p_salon_id IS NULL OR j.salon_id = p_salon_id)
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

REVOKE ALL ON FUNCTION public.claim_fiscal_print_jobs(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_fiscal_print_jobs(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_fiscal_print_jobs(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fiscal_print_jobs(text, integer, integer) TO service_role;

COMMIT;
