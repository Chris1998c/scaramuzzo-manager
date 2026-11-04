-- Verifica migration 20261104150000_customers_select_staff_initplan.sql
-- Eseguire sul remoto (SQL Editor o: supabase db query --linked -f scripts/verify-customers-select-staff-initplan.sql).
-- Questo file NON applica la migration: solo letture, EXPLAIN e check semantici.
--
-- Sostituire ogni '<<STAFF_USER_ID>>' / '<<LINKED_USER_ID>>' / '<<LINKED_CUSTOMER_ID>>' /
-- '<<UNLINKED_CLIENT_USER_ID>>' con UUID reali già presenti nel remoto.
-- Discovery in sola lettura (non inventare identità):

-- select u.id, r.name
-- from public.users u
-- join public.roles r on r.id = u.role_id
-- where r.name in ('reception', 'coordinator', 'magazzino')
-- order by r.name, u.id
-- limit 20;

-- select l.user_id, l.customer_id
-- from public.customer_auth_links l
-- limit 5;

-- select u.id
-- from public.users u
-- join public.roles r on r.id = u.role_id
-- where r.name = 'cliente'
--   and not exists (
--     select 1 from public.customer_auth_links l where l.user_id = u.id
--   )
-- limit 5;

-- =============================================================================
-- 0) Policy effettiva (eseguire PRIMA e DOPO la migration)
-- =============================================================================
SELECT
  policyname,
  roles,
  cmd,
  permissive,
  qual AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'customers'
  AND policyname = 'customers_select_staff_or_self';

-- Atteso DOPO (forma ALTER POLICY già usata sul remoto):
--   ((SELECT is_staff()) OR is_customer_app_user(id))
-- (pg può omettere lo schema public e normalizzare spazi/parentesi).

-- =============================================================================
-- 1) Performance PRIMA / DOPO — stessa query PAIR, stesso utente authenticated
--    Baseline remota già misurata (riferimento):
--      senza RLS: ~14.393 ms, ~513 buffer hit
--      con RLS pre-fix: ~716.673 ms, ~37.737 buffer hit
-- =============================================================================
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<<STAFF_USER_ID>>',
    'role', 'authenticated'
  )::text,
  true
);

explain (analyze, buffers)
select id, customer_code, first_name, last_name, phone, email
from public.customers
where first_name ilike '%alda%'
  and last_name ilike '%d''eusanio%'
limit 12;

rollback;

-- =============================================================================
-- 2) Controllo piano InitPlan (DOPO migration, stesso blocco di cui sopra)
--    Cercare nel testo di EXPLAIN:
--      - presente: nodo InitPlan che valuta is_staff (una volta)
--      - assente: Filter/recheck che richiama is_staff/current_role_name per ogni
--        riga di customers
--    Per utente staff, dopo InitPlan true, is_customer_app_user non deve
--    scansionare customer_auth_links per ogni riga.
--    Confrontare "Buffers: shared hit" con ~37k (pre) vs vicino a ~513 (target).
-- =============================================================================

-- =============================================================================
-- 3) Accesso — solo con account esistenti; saltare i blocchi senza UUID reale
-- =============================================================================

-- 3a) Staff
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<<STAFF_USER_ID>>',
    'role', 'authenticated'
  )::text,
  true
);

select public.is_staff() as is_staff_as_staff; -- atteso true

select count(*)::int as customers_visible_staff
from (
  select id from public.customers limit 50
) s; -- atteso > 0

rollback;

-- 3b) Cliente collegato (riga reale in customer_auth_links)
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<<LINKED_USER_ID>>',
    'role', 'authenticated'
  )::text,
  true
);

select public.is_staff() as is_staff_as_customer; -- atteso false
select public.is_customer_app_user('<<LINKED_CUSTOMER_ID>>'::uuid) as can_see_self; -- atteso true

select count(*)::int as rows_self
from public.customers
where id = '<<LINKED_CUSTOMER_ID>>'::uuid; -- atteso 1

select exists (
  select 1
  from public.customers
  where id <> '<<LINKED_CUSTOMER_ID>>'::uuid
) as sees_any_other; -- atteso false

rollback;

-- 3c) Cliente autenticato senza link (solo se discovery ha trovato un id)
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<<UNLINKED_CLIENT_USER_ID>>',
    'role', 'authenticated'
  )::text,
  true
);

select public.is_staff() as is_staff_unlinked; -- atteso false
select count(*)::int as customers_visible_unlinked
from public.customers; -- atteso 0

rollback;
