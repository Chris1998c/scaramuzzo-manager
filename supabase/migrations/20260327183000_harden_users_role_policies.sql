BEGIN;

-- Hardening minimo anti-escalation:
-- l'utente autenticato puo' creare/aggiornare solo il proprio profilo mantenendo role_id=4 (cliente).
-- I ruoli staff/coordinator devono essere assegnati da flussi amministrativi, non self-service.

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own"
ON public.users
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((id = auth.uid()) AND (role_id = 4));

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
ON public.users
AS PERMISSIVE
FOR UPDATE
TO public
USING ((id = auth.uid()))
WITH CHECK ((id = auth.uid()) AND (role_id = 4));

COMMIT;
