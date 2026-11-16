-- =============================================================================
-- BONIFICA VENDITE CLASSE A — ANTEPRIMA / DA ESEGUIRE SOLO DOPO FIRMA TITOLARE
-- =============================================================================
-- NON eseguire in produzione senza backup verificabile + conferma esplicita.
-- Scope: solo sales di classe A (nessun job sale_receipt completed, nessun
--        fiscalReceiptNumber). Classi B/C NON sono in questo elenco.
--
-- Classe A eliminabili (review 2026-11-16, sale 63 ESCLUSA → C):
--   8, 9, 27, 35, 47, 48, 49, 50, 51, 55, 56, 59, 60, 62, 67, 73, 74, 76
-- Escluse / PRESERVARE (B/C):
--   52, 53, 54, 57, 58, 63, 64, 70, 72, 75
--
-- Nota criterio "pending": le C irrisolte (52,54,57,58,63) restano pending/queued/
-- printed come da DB; NON vanno azzerate a 0 per convenienza. Dopo questa
-- bonifica A, i pending residui = solo C da reconcile.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _cleanup_class_a (
  sale_id bigint PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _cleanup_class_a (sale_id) VALUES
  (8), (9), (27), (35), (47), (48), (49), (50), (51),
  (55), (56), (59), (60), (62), (67), (73), (74), (76);

-- ---------------------------------------------------------------------------
-- PRECONDIZIONI (falliscono → ROLLBACK automatico se non si ignora l'errore)
-- ---------------------------------------------------------------------------

-- 1) Tutti gli ID esistono ancora
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM _cleanup_class_a c
  LEFT JOIN public.sales s ON s.id = c.sale_id
  WHERE s.id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: % sale_id assenti da sales', missing;
  END IF;
END $$;

-- 2) Nessuna ha job sale_receipt completed (protezione anti-B/C)
DO $$
DECLARE bad int;
BEGIN
  SELECT count(DISTINCT c.sale_id) INTO bad
  FROM _cleanup_class_a c
  JOIN public.fiscal_print_jobs j ON j.sale_id = c.sale_id
  WHERE j.kind = 'sale_receipt' AND j.status = 'completed';
  IF bad > 0 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: % sales hanno sale_receipt completed — abort', bad;
  END IF;
END $$;

-- 3) Nessuna ha evidence di fiscalReceiptNumber nei result job
DO $$
DECLARE bad int;
BEGIN
  SELECT count(DISTINCT c.sale_id) INTO bad
  FROM _cleanup_class_a c
  JOIN public.fiscal_print_jobs j ON j.sale_id = c.sale_id
  WHERE j.result::text ILIKE '%fiscalReceiptNumber%';
  IF bad > 0 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: % sales con fiscalReceiptNumber in job result — abort', bad;
  END IF;
END $$;

-- 4) Snapshot conteggi PRIMA
DO $$
BEGIN
  RAISE NOTICE 'BEFORE sales=%', (SELECT count(*) FROM public.sales);
  RAISE NOTICE 'BEFORE class_a_targets=%', (SELECT count(*) FROM _cleanup_class_a);
  RAISE NOTICE 'BEFORE appts_linked=%', (
    SELECT count(*) FROM public.appointments a
    WHERE a.sale_id IN (SELECT sale_id FROM _cleanup_class_a)
  );
  RAISE NOTICE 'BEFORE sale_items=%', (
    SELECT count(*) FROM public.sale_items si
    WHERE si.sale_id IN (SELECT sale_id FROM _cleanup_class_a)
  );
  RAISE NOTICE 'BEFORE jobs_on_targets=%', (
    SELECT count(*) FROM public.fiscal_print_jobs j
    WHERE j.sale_id IN (SELECT sale_id FROM _cleanup_class_a)
  );
  RAISE NOTICE 'BEFORE stock_mv_on_targets=%', (
    SELECT count(*) FROM public.stock_movements sm
    WHERE sm.sale_id IN (SELECT sale_id FROM _cleanup_class_a)
  );
END $$;

-- ---------------------------------------------------------------------------
-- MUTAZIONI
-- ---------------------------------------------------------------------------

-- Unlink appuntamenti (non cancellare gli appointment)
UPDATE public.appointments
SET sale_id = NULL
WHERE sale_id IN (SELECT sale_id FROM _cleanup_class_a);

-- Job residui sulle A (oggi 0; safety net) — solo se sale_id in A
DELETE FROM public.fiscal_print_jobs
WHERE sale_id IN (SELECT sale_id FROM _cleanup_class_a);

-- Righe vendita
DELETE FROM public.sale_items
WHERE sale_id IN (SELECT sale_id FROM _cleanup_class_a);

-- Vendite
DELETE FROM public.sales
WHERE id IN (SELECT sale_id FROM _cleanup_class_a);

-- ---------------------------------------------------------------------------
-- POSTCONDIZIONI
-- ---------------------------------------------------------------------------
DO $$
DECLARE left_a int;
DECLARE bc int;
BEGIN
  SELECT count(*) INTO left_a
  FROM public.sales s
  WHERE s.id IN (8,9,27,35,47,48,49,50,51,55,56,59,60,62,67,73,74,76);
  IF left_a <> 0 THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: % class-A sales ancora presenti', left_a;
  END IF;

  -- B/C devono esistere ancora (include 63)
  SELECT count(*) INTO bc
  FROM public.sales s
  WHERE s.id IN (52,53,54,57,58,63,64,70,72,75);
  IF bc < 10 THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: B/C preservate incomplete (found % of 10)', bc;
  END IF;

  RAISE NOTICE 'AFTER sales=%', (SELECT count(*) FROM public.sales);
  RAISE NOTICE 'AFTER pending_or_queued_or_printed_unresolved=%', (
    SELECT count(*) FROM public.sales
    WHERE fiscal_status IN ('pending','queued')
       OR (fiscal_status = 'printed' AND id IN (54))
  );
  RAISE NOTICE 'OK: class A removed; B/C preserved';
END $$;

-- Esecuzione autorizzata pre-lancio (backup verificato).
COMMIT;
-- ROLLBACK;
