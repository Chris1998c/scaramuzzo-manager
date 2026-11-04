-- Rollback di 20261104150000_customers_select_staff_initplan.sql
-- Ripristina la policy SELECT customers allo stato post-20260525210000.
-- Forma ALTER POLICY (simmetrica alla migration).

BEGIN;

ALTER POLICY customers_select_staff_or_self
  ON public.customers
  USING (public.is_staff() OR public.is_customer_app_user(id));

COMMIT;
