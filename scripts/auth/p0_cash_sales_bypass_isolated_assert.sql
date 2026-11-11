-- Assert post-migration su Postgres isolato.
-- Usa DO blocks con RAISE EXCEPTION se un check fallisce.

CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond boolean, msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FAIL: %', msg;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Grant: authenticated non può EXECUTE open/close_cash_session
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('authenticated', 'public.open_cash_session(integer,date,numeric,text)', 'EXECUTE'),
    'authenticated must NOT EXECUTE open_cash_session'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('authenticated', 'public.close_cash_session(integer,date,numeric,text)', 'EXECUTE'),
    'authenticated must NOT EXECUTE close_cash_session'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.open_cash_session(integer,date,numeric,text)', 'EXECUTE'),
    'anon must NOT EXECUTE open_cash_session'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.open_cash_session(integer,date,numeric,text)', 'EXECUTE'),
    'service_role must EXECUTE open_cash_session'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.close_cash_session(integer,date,numeric,text)', 'EXECUTE'),
    'service_role must EXECUTE close_cash_session'
  );
  PERFORM pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'public.sales', 'INSERT'),
    'authenticated must NOT INSERT sales'
  );
  PERFORM pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'public.sale_items', 'INSERT'),
    'authenticated must NOT INSERT sale_items'
  );
  PERFORM pg_temp.assert_true(
    has_table_privilege('service_role', 'public.sales', 'INSERT'),
    'service_role must INSERT sales (Next close_sale_atomic path)'
  );
END $$;

-- ---------------------------------------------------------------------------
-- B) Magazzino JWT: tentativi diretti verso sede 1 devono fallire
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_mag uuid := '22222222-2222-2222-2222-222222222222';
  v_ok boolean;
  v_sale_id bigint;
BEGIN
  -- Impersona magazzino
  PERFORM set_config('role', 'authenticated', true);
  PERFORM pg_temp.as_user(v_mag);

  PERFORM pg_temp.assert_true(public.is_magazzino(), 'fixture magazzino role');
  PERFORM pg_temp.assert_true(public.can_access_salon(1), 'can_access_salon ancora true per mag (non modificato)');
  PERFORM pg_temp.assert_true(public.current_salon_id() = 5, 'mag assigned only to 5');

  -- open_cash_session: permission denied (no EXECUTE)
  BEGIN
    PERFORM * FROM public.open_cash_session(1, CURRENT_DATE, 10, 'bypass');
    PERFORM pg_temp.assert_true(false, 'mag open_cash_session(1) should be denied');
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission denied%' OR SQLERRM ILIKE '%must be owner%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;

  -- close_cash_session: permission denied
  BEGIN
    PERFORM * FROM public.close_cash_session(1, CURRENT_DATE, 10, 'bypass');
    PERFORM pg_temp.assert_true(false, 'mag close_cash_session(1) should be denied');
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission denied%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;

  -- INSERT sales salon 1: privilege revoked
  BEGIN
    INSERT INTO public.sales (salon_id, total_amount, payment_method)
    VALUES (1, 50, 'cash')
    RETURNING id INTO v_sale_id;
    PERFORM pg_temp.assert_true(false, 'mag INSERT sales salon 1 should be denied');
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission denied%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;

  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- C) Percorso Next legittimo: service_role apre cassa sede 1 + inserisce vendita
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cs bigint;
  v_sale bigint;
  v_item bigint;
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- Equivalente funzionale a /api/cassa/open (admin insert) + legacy RPC ancora per service_role
  INSERT INTO public.cash_sessions (salon_id, session_date, opened_by, opening_cash, status)
  VALUES (1, CURRENT_DATE, '11111111-1111-1111-1111-111111111111', 100, 'open')
  RETURNING id INTO v_cs;

  PERFORM pg_temp.assert_true(v_cs IS NOT NULL, 'service_role can insert cash_sessions (Next open)');

  SELECT cash_session_id INTO v_cs
  FROM public.open_cash_session(1, CURRENT_DATE, 0, 'service path');
  PERFORM pg_temp.assert_true(v_cs IS NOT NULL, 'service_role can still call open_cash_session');

  INSERT INTO public.sales (salon_id, total_amount, payment_method, cash_session_id)
  VALUES (1, 40, 'cash', v_cs)
  RETURNING id INTO v_sale;
  PERFORM pg_temp.assert_true(v_sale IS NOT NULL, 'service_role INSERT sales (close_sale_atomic path)');

  INSERT INTO public.sale_items (sale_id, quantity, price)
  VALUES (v_sale, 1, 40)
  RETURNING id INTO v_item;
  PERFORM pg_temp.assert_true(v_item IS NOT NULL, 'service_role INSERT sale_items');

  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- D) Reception sede 1: niente EXECUTE legacy; SELECT ok; INSERT sales negato (solo API)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM pg_temp.as_user('33333333-3333-3333-3333-333333333333');

  PERFORM pg_temp.assert_true(public.is_reception(), 'fixture reception');
  PERFORM pg_temp.assert_true(public.can_access_salon(1), 'reception can access own salon');
  PERFORM pg_temp.assert_true(public.can_access_salon(2) IS NOT TRUE, 'reception cannot access other salon');

  BEGIN
    PERFORM * FROM public.open_cash_session(1, CURRENT_DATE, 0, 'rec');
    PERFORM pg_temp.assert_true(false, 'reception must not EXECUTE open_cash_session (use Next)');
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission denied%' THEN NULL; ELSE RAISE; END IF;
  END;

  PERFORM pg_temp.assert_true(
    (SELECT count(*) > 0 FROM public.cash_sessions WHERE salon_id = 1),
    'reception can SELECT own cash_sessions'
  );

  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- E) Utente senza accesso (cliente): niente cassa/vendite write
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM pg_temp.as_user('44444444-4444-4444-4444-444444444444');

  PERFORM pg_temp.assert_true(public.can_access_salon(1) IS NOT TRUE, 'cliente no salon access');

  BEGIN
    PERFORM * FROM public.open_cash_session(1, CURRENT_DATE, 0, 'cli');
    PERFORM pg_temp.assert_true(false, 'cliente open_cash_session denied');
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission denied%' OR SQLERRM ILIKE '%accesso negato%' THEN NULL; ELSE RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.sales (salon_id, total_amount) VALUES (1, 1);
    PERFORM pg_temp.assert_true(false, 'cliente INSERT sales denied');
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%permission denied%' THEN NULL; ELSE RAISE; END IF;
  END;

  RESET ROLE;
END $$;

-- ---------------------------------------------------------------------------
-- F) Defense-in-depth policy: anche con INSERT temporaneo, mag non scrive sede 1
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sale bigint;
BEGIN
  GRANT INSERT ON TABLE public.sales TO authenticated;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM pg_temp.as_user('22222222-2222-2222-2222-222222222222');

  BEGIN
    INSERT INTO public.sales (salon_id, total_amount) VALUES (1, 99) RETURNING id INTO v_sale;
    PERFORM pg_temp.assert_true(false, 'policy must block mag INSERT sales salon 1 even if INSERT granted');
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      -- RLS violation typically 42501 or check option
      IF SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%permission denied%' OR SQLSTATE = '42501' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;

  -- Mag può inserire solo sul proprio salone 5 se INSERT ri-concesso
  INSERT INTO public.sales (salon_id, total_amount) VALUES (5, 12) RETURNING id INTO v_sale;
  PERFORM pg_temp.assert_true(v_sale IS NOT NULL, 'policy allows mag INSERT on assigned salon 5');

  RESET ROLE;
  REVOKE INSERT ON TABLE public.sales FROM authenticated;
END $$;

SELECT 'p0_cash_sales_bypass_isolated_assert: OK' AS result;
