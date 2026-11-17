-- Storico fatturato BOSS per collaboratore (LAV002).
-- Non crea vendite/scontrini: ripartizione attributiva, non sommare ai totali Vendite.

CREATE TABLE IF NOT EXISTS public.legacy_staff_turnover (
  id bigserial PRIMARY KEY,
  salon_id integer NOT NULL REFERENCES public.salons (id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  boss_name text NOT NULL,
  boss_code text NOT NULL,
  staff_id integer NULL REFERENCES public.staff (id),
  amount_gross numeric(14, 2) NOT NULL,
  services_gross numeric(14, 2) NOT NULL DEFAULT 0,
  products_gross numeric(14, 2) NOT NULL DEFAULT 0,
  qty_total numeric(14, 2) NOT NULL DEFAULT 0,
  match_status text NOT NULL
    CHECK (match_status IN ('matched_active', 'matched_inactive', 'unmatched')),
  source_batch text NOT NULL,
  source_file text NOT NULL,
  period_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_staff_turnover_period_chk CHECK (period_from <= period_to),
  CONSTRAINT legacy_staff_turnover_batch_code_uidx UNIQUE (salon_id, source_batch, boss_code)
);

CREATE INDEX IF NOT EXISTS legacy_staff_turnover_salon_period_idx
  ON public.legacy_staff_turnover (salon_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS legacy_staff_turnover_staff_id_idx
  ON public.legacy_staff_turnover (staff_id)
  WHERE staff_id IS NOT NULL;

COMMENT ON TABLE public.legacy_staff_turnover IS
  'Fatturato IVA inclusa attribuito ai collaboratori da export Boss LAV002. Non rientra nei totali vendite live.';

ALTER TABLE public.legacy_staff_turnover ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legacy_staff_turnover_select_authenticated ON public.legacy_staff_turnover;
CREATE POLICY legacy_staff_turnover_select_authenticated
  ON public.legacy_staff_turnover
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.legacy_staff_turnover TO authenticated;
GRANT ALL ON public.legacy_staff_turnover TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.legacy_staff_turnover_id_seq TO service_role;
