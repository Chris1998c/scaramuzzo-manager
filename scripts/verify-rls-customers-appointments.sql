-- Verifica post-migration (eseguire su remote: supabase db query --linked -f scripts/verify-rls-customers-appointments.sql)
-- Oppure incollare in SQL Editor Supabase.

-- 1) Policy customers (deve usare is_customer_app_user, non id = auth.uid())
SELECT tablename, policyname, cmd, left(qual, 200) AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers', 'customer_profile', 'customer_service_cards', 'appointments')
ORDER BY tablename, policyname;

-- 2) Nessuna policy DML su appointments per authenticated
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'appointments'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

-- 3) Grant appointments / appointment_services per authenticated
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name IN ('appointments', 'appointment_services', 'customers')
GROUP BY table_name
ORDER BY table_name;

-- 4) Funzione claim presente
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname = 'is_customer_app_user';
