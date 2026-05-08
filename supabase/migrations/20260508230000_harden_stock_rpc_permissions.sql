BEGIN;

REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stock_move(integer, numeric, integer, integer, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.execute_transfer(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_transfer(bigint) FROM anon;
REVOKE ALL ON FUNCTION public.execute_transfer(bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_transfer(bigint) TO service_role;

COMMIT;
