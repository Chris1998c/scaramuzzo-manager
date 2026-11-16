-- Final EXECUTE lock after 20261116180000 creates the RPCs.
-- Needed because CREATE OR REPLACE inherits default privileges for anon/authenticated.

REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) TO service_role;
