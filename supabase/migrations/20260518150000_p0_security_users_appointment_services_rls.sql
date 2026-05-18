-- P0 Security: anti self-escalation su public.users + chiusura DML client su appointment_services.

BEGIN;

-- ---------------------------------------------------------------------------
-- P0 #1 — users.role_id: policy + trigger (defense in depth)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_insert_own"
  ON public.users
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((id = auth.uid()) AND (role_id = 4));

CREATE POLICY "users_update_own"
  ON public.users
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK ((id = auth.uid()) AND (role_id = 4));

CREATE OR REPLACE FUNCTION public.guard_users_role_id_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := coalesce(auth.jwt() ->> 'role', '');

  -- Backend admin (service_role) e migrazioni possono gestire i ruoli.
  IF v_jwt_role = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role_id IS DISTINCT FROM 4 THEN
      RAISE EXCEPTION 'users.role_id: solo ruolo cliente (4) consentito in registrazione';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    RAISE EXCEPTION 'users.role_id: modifica ruolo non consentita';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_users_role_id ON public.users;
CREATE TRIGGER trg_guard_users_role_id
  BEFORE INSERT OR UPDATE OF role_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_users_role_id_escalation();

-- ---------------------------------------------------------------------------
-- P0 #2 — appointment_services: niente mutazioni client dirette
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "update appointment services" ON public.appointment_services;
DROP POLICY IF EXISTS "appointment_services_insert" ON public.appointment_services;
DROP POLICY IF EXISTS "appointment_services_insert_own_salon" ON public.appointment_services;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.appointment_services FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.appointment_services FROM authenticated;

GRANT SELECT ON public.appointment_services TO authenticated;

COMMIT;
