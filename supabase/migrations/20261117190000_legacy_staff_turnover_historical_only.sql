-- LAV002: nominativi storici puri (staff_id NULL); periodo non confermato; importi in centesimi.

ALTER TABLE public.legacy_staff_turnover
  ALTER COLUMN period_from DROP NOT NULL,
  ALTER COLUMN period_to DROP NOT NULL;

ALTER TABLE public.legacy_staff_turnover
  DROP CONSTRAINT IF EXISTS legacy_staff_turnover_period_chk;

ALTER TABLE public.legacy_staff_turnover
  ADD CONSTRAINT legacy_staff_turnover_period_chk
  CHECK (
    (period_from IS NULL AND period_to IS NULL)
    OR (period_from IS NOT NULL AND period_to IS NOT NULL AND period_from <= period_to)
  );

ALTER TABLE public.legacy_staff_turnover
  ADD COLUMN IF NOT EXISTS period_confirmed boolean NOT NULL DEFAULT false;

-- Rimuovi CHECK match_status precedente (nome auto o esplicito).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'legacy_staff_turnover'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%match_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.legacy_staff_turnover DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

UPDATE public.legacy_staff_turnover
SET
  staff_id = NULL,
  match_status = 'historical',
  period_from = NULL,
  period_to = NULL,
  period_confirmed = false,
  period_note = 'Periodo assente nel file LAV002: storico da verificare, non attribuire a filtri data finché non confermato.',
  source_batch = 'boss_lav002_roma_unconfirmed',
  updated_at = now()
WHERE salon_id = 1
  AND source_batch = 'boss_lav002_roma_20220101_20261031';

-- Importi esatti da Totali collaboratore (centesimi arrotondati dal float Boss).
UPDATE public.legacy_staff_turnover SET amount_gross = 19813.61, services_gross = 19395.11, products_gross = 418.50 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '556';
UPDATE public.legacy_staff_turnover SET amount_gross = 14324.80, services_gross = 12687.10, products_gross = 1637.70 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '187';
UPDATE public.legacy_staff_turnover SET amount_gross = 544.00, services_gross = 544.00, products_gross = 0.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '86';
UPDATE public.legacy_staff_turnover SET amount_gross = 13635.06, services_gross = 13241.06, products_gross = 394.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '204';
UPDATE public.legacy_staff_turnover SET amount_gross = 316593.72, services_gross = 300665.75, products_gross = 15927.91 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '431';
UPDATE public.legacy_staff_turnover SET amount_gross = 4358.80, services_gross = 4338.80, products_gross = 20.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '47';
UPDATE public.legacy_staff_turnover SET amount_gross = 1560.40, services_gross = 1540.40, products_gross = 20.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '120';
UPDATE public.legacy_staff_turnover SET amount_gross = 112709.72, services_gross = 110399.83, products_gross = 2309.90 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '110';
UPDATE public.legacy_staff_turnover SET amount_gross = 35817.70, services_gross = 34966.80, products_gross = 850.90 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '289';
UPDATE public.legacy_staff_turnover SET amount_gross = 6014.90, services_gross = 5994.90, products_gross = 20.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '66';
UPDATE public.legacy_staff_turnover SET amount_gross = 3871.00, services_gross = 3836.00, products_gross = 35.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '79';
UPDATE public.legacy_staff_turnover SET amount_gross = 26721.95, services_gross = 25649.95, products_gross = 1072.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '180';
UPDATE public.legacy_staff_turnover SET amount_gross = 11917.65, services_gross = 11124.65, products_gross = 793.00 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '202';
UPDATE public.legacy_staff_turnover SET amount_gross = 7123.05, services_gross = 6728.75, products_gross = 394.30 WHERE salon_id = 1 AND source_batch = 'boss_lav002_roma_unconfirmed' AND boss_code = '71';

ALTER TABLE public.legacy_staff_turnover
  ADD CONSTRAINT legacy_staff_turnover_match_status_check
  CHECK (match_status = 'historical');

COMMENT ON COLUMN public.legacy_staff_turnover.period_confirmed IS
  'false = periodo BOSS non nel file / non confermato: non usare nei filtri data Report.';
