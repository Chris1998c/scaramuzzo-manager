BEGIN;

REVOKE ALL ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  integer
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  integer
) FROM anon;

REVOKE ALL ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  integer
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.close_sale_atomic(
  integer,
  uuid,
  numeric,
  text,
  numeric,
  jsonb,
  integer
) TO service_role;

COMMIT;
