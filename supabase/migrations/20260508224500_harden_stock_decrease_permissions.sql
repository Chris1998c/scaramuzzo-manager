BEGIN;

REVOKE ALL ON FUNCTION public.stock_decrease(
  integer,
  integer,
  numeric,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.stock_decrease(
  integer,
  integer,
  numeric,
  text
) FROM anon;

REVOKE ALL ON FUNCTION public.stock_decrease(
  integer,
  integer,
  numeric,
  text
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.stock_decrease(
  integer,
  integer,
  numeric,
  text
) TO service_role;

COMMIT;
