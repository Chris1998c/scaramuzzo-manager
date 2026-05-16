BEGIN;

-- Rimuove overload legacy a 6 arg: PostgREST non riesce a disambiguare vs (..., uuid DEFAULT NULL).
-- Le chiamate SQL a 6 argomenti continuano a risolvere sulla firma a 7 parametri (default su uuid).
DROP FUNCTION IF EXISTS public.stock_move(integer, numeric, integer, integer, text, text);

COMMIT;
