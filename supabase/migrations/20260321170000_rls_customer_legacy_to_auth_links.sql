-- Fase A–D: legacy self-cliente (id = auth.uid) → customer_auth_links + helper RLS.
-- Non modifica policy staff / salone / agenda / cassa / magazzino.

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Backfill idempotente: solo dove customers.id coincide con auth.users.id (legacy)
--    e non esiste ancora un link per quel customer_id o quel user_id.
-- ---------------------------------------------------------------------------
INSERT INTO public.customer_auth_links (
  customer_id,
  user_id,
  linked_at,
  link_method,
  verified_at
)
SELECT
  c.id,
  c.id,
  now(),
  'legacy_migration',
  now()
FROM public.customers AS c
INNER JOIN auth.users AS u ON u.id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_auth_links AS l WHERE l.customer_id = c.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.customer_auth_links AS l2 WHERE l2.user_id = c.id
);

-- ---------------------------------------------------------------------------
-- D) Lettura propria riga su customer_auth_links (prima della funzione helper
--    che interroga questa tabella sotto RLS).
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.customer_auth_links TO authenticated;

CREATE POLICY customer_auth_links_select_own
  ON public.customer_auth_links
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- B) Helper per policy: self-cliente tramite bridge, non più id = auth.uid su customers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_customer_app_user(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_auth_links AS l
    WHERE l.customer_id = p_customer_id
      AND l.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_customer_app_user(uuid) IS
  'True se auth.uid() ha un link in customer_auth_links verso il dato customer_id.';

GRANT EXECUTE ON FUNCTION public.is_customer_app_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_app_user(uuid) TO anon;

-- ---------------------------------------------------------------------------
-- C) Sostituzione solo del ramo self legacy (mantiene rami staff invariati).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS customers_select_staff_or_self ON public.customers;
CREATE POLICY customers_select_staff_or_self
  ON public.customers
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_staff() OR public.is_customer_app_user(id));

DROP POLICY IF EXISTS customer_profile_select_staff_or_self ON public.customer_profile;
CREATE POLICY customer_profile_select_staff_or_self
  ON public.customer_profile
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_staff() OR public.is_customer_app_user(customer_id));

DROP POLICY IF EXISTS customer_service_cards_select_staff_or_self ON public.customer_service_cards;
CREATE POLICY customer_service_cards_select_staff_or_self
  ON public.customer_service_cards
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_staff() OR public.is_customer_app_user(customer_id));

DROP POLICY IF EXISTS cliente_notifications ON public.notifications;
CREATE POLICY cliente_notifications
  ON public.notifications
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    customer_id IS NOT NULL
    AND public.is_customer_app_user(customer_id)
  );

DROP POLICY IF EXISTS cliente_read_technical_sheets ON public.technical_sheets;
CREATE POLICY cliente_read_technical_sheets
  ON public.technical_sheets
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (public.is_customer_app_user(customer_id));

DROP POLICY IF EXISTS cliente_technical_sheets ON public.technical_sheets;
CREATE POLICY cliente_technical_sheets
  ON public.technical_sheets
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (public.is_customer_app_user(customer_id));

COMMIT;
