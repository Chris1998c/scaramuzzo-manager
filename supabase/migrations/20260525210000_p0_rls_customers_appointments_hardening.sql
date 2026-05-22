-- P0/P1 Security: ripristino policy cliente (customer_auth_links) + blocco DML client su appointments.
-- Corregge regressione introdotta da 20260516091830_remote_schema.sql su policy customers correlate.
-- Modello allineato a 20260321170000_rls_customer_legacy_to_auth_links.sql e 20260518150000 (appointment_services).

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Helper claim (idempotente; già presente da restore WhatsApp)
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
-- B) Customers + satellite: SELECT cliente via bridge, staff invariato
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

-- INSERT/UPDATE/DELETE customers: policy staff esistenti (insert_staff, update_staff, delete_admin) — non modificate.

-- ---------------------------------------------------------------------------
-- C) Appointments: solo SELECT client; mutazioni via API service_role
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS appointments_insert_auth ON public.appointments;
DROP POLICY IF EXISTS appointments_update_auth ON public.appointments;
DROP POLICY IF EXISTS appointments_delete_auth ON public.appointments;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.appointments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.appointments FROM authenticated;

GRANT SELECT ON public.appointments TO authenticated;

-- appointments_select_auth (can_access_salon) resta dalla baseline — non ricreata qui.

COMMIT;
