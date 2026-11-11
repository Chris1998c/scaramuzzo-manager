-- P0: chiude bypass PostgREST magazzino su cassa/vendite fuori user_salons.
-- Non modifica can_access_salon, clienti/schede, stock, fiscal jobs, bridge.
--
-- Contesto chiamanti (repo + remoto):
-- - /api/cassa/open        → supabaseAdmin INSERT cash_sessions (service_role), NON open_cash_session
-- - /api/cassa/close-session → close_cash_session_atomic (EXECUTE solo service_role)
-- - /api/cassa/close       → close_sale_atomic (EXECUTE solo service_role)
-- - /api/cassa/admin-close-session → admin_close_cash_session (JWT authenticated, solo coordinator)
-- - Nessun caller TS/JS di open_cash_session / close_cash_session (legacy)
-- - Nessun INSERT client su sales/sale_items (solo close_sale_atomic)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Legacy open/close_cash_session: non invocabili da JWT authenticated/anon
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.open_cash_session(integer, date, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_cash_session(integer, date, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.open_cash_session(integer, date, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_session(integer, date, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.close_cash_session(integer, date, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(integer, date, numeric, text) TO service_role;

COMMENT ON FUNCTION public.open_cash_session(integer, date, numeric, text) IS
  'Legacy SECURITY DEFINER. EXECUTE solo service_role. Percorso UI: /api/cassa/open via supabaseAdmin.';

COMMENT ON FUNCTION public.close_cash_session(integer, date, numeric, text) IS
  'Legacy SECURITY DEFINER. EXECUTE solo service_role. Percorso UI: close_cash_session_atomic via /api/cassa/close-session.';

-- ---------------------------------------------------------------------------
-- 2) INSERT diretto sales/sale_items: non da JWT (flusso atomico/fiscale = close_sale_atomic)
--    Policy ristretta come difesa in profondità se INSERT venisse ri-concesso.
-- ---------------------------------------------------------------------------
REVOKE INSERT ON TABLE public.sales FROM PUBLIC;
REVOKE INSERT ON TABLE public.sales FROM anon;
REVOKE INSERT ON TABLE public.sales FROM authenticated;

REVOKE INSERT ON TABLE public.sale_items FROM PUBLIC;
REVOKE INSERT ON TABLE public.sale_items FROM anon;
REVOKE INSERT ON TABLE public.sale_items FROM authenticated;

DROP POLICY IF EXISTS sales_insert_auth ON public.sales;
CREATE POLICY sales_insert_auth ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_salon(salon_id)
    AND (
      NOT public.is_magazzino()
      OR EXISTS (
        SELECT 1
        FROM public.user_salons us
        WHERE us.user_id = (SELECT auth.uid())
          AND us.salon_id = sales.salon_id
      )
    )
  );

DROP POLICY IF EXISTS sale_items_insert ON public.sale_items;
CREATE POLICY sale_items_insert ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND public.can_access_salon(s.salon_id)
        AND (
          NOT public.is_magazzino()
          OR EXISTS (
            SELECT 1
            FROM public.user_salons us
            WHERE us.user_id = (SELECT auth.uid())
              AND us.salon_id = s.salon_id
          )
        )
    )
  );

COMMIT;
