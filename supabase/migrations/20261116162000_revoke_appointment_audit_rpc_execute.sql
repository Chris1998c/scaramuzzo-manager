-- P0 follow-up: lock EXECUTE on appointment cancel/hard-delete RPCs.
-- Default privileges had left anon/authenticated with EXECUTE despite REVOKE PUBLIC.

REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_with_audit(bigint, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_appointment_with_audit(bigint, uuid, text) TO service_role;
