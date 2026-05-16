-- Fase A Staff: RLS su tabelle satellite + presenze (attendance_logs source of truth via API service role).
-- Non modifica public.staff.

BEGIN;

-- 1) Revoca esposizione anon
REVOKE ALL ON public.staff_salons FROM anon;
REVOKE ALL ON public.staff_schedule FROM anon;
REVOKE ALL ON public.attendance_logs FROM anon;
REVOKE ALL ON public.staff_attendance_logs FROM anon;

-- 2) Nessun DML client autenticato (letture governate da policy dove previste)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.staff_salons FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.staff_schedule FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attendance_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.staff_attendance_logs FROM authenticated;

-- SELECT esplicito per tabelle con policy client (attendance_logs: solo service role / API)
GRANT SELECT ON public.staff_salons TO authenticated;
GRANT SELECT ON public.staff_schedule TO authenticated;
GRANT SELECT ON public.staff_attendance_logs TO authenticated;

-- 3) RLS
ALTER TABLE public.staff_salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance_logs ENABLE ROW LEVEL SECURITY;

-- 4) Policy SELECT
DROP POLICY IF EXISTS staff_salons_select_salon ON public.staff_salons;
CREATE POLICY staff_salons_select_salon
  ON public.staff_salons
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.can_access_salon((salon_id)::integer));

DROP POLICY IF EXISTS staff_schedule_select_salon ON public.staff_schedule;
CREATE POLICY staff_schedule_select_salon
  ON public.staff_schedule
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.can_access_salon((salon_id)::integer));

-- Legacy: solo coordinator (audit); presenze web usano attendance_logs via service role
DROP POLICY IF EXISTS staff_attendance_logs_select_coordinator ON public.staff_attendance_logs;
CREATE POLICY staff_attendance_logs_select_coordinator
  ON public.staff_attendance_logs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_coordinator());

-- attendance_logs: nessuna policy client → deny PostgREST diretto; API mobile/web usano service_role

COMMIT;
