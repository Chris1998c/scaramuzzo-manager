-- Early revoke helper (timestamp before function create migration 20261116180000).
-- Safe no-op when RPCs do not exist yet (fresh replay / empty DB).
-- Final lock is enforced by 20261116180100 after CREATE OR REPLACE.

DO $$
BEGIN
  IF to_regprocedure('public.cancel_appointment_with_audit(bigint,uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) TO service_role';
  END IF;

  IF to_regprocedure('public.hard_delete_appointment_with_audit(bigint,uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) TO service_role';
  END IF;
END $$;
