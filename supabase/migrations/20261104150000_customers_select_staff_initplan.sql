-- Prestazioni RLS customers: valuta is_staff() una sola volta per query (InitPlan).
-- Semantica invariata: staff OR self via customer_auth_links.
-- Forma allineata a quanto già applicato sul remoto via SQL Editor (ALTER POLICY).

BEGIN;

ALTER POLICY customers_select_staff_or_self
  ON public.customers
  USING ((SELECT public.is_staff()) OR public.is_customer_app_user(id));

COMMIT;
