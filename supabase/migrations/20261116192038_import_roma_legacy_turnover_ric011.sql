-- BOSS RIC011 Roma: importo incassato IVA inclusa per data e linea, senza righe fiscali.
-- Source file SHA256: 7cff1d17c8a2d2883ae5d5fdb2a8348eb9187ab663025c13ea28fd877cf553e3
CREATE TABLE public.legacy_turnover_daily (
 salon_id integer NOT NULL REFERENCES public.salons(id),
 day date NOT NULL,
 viacard numeric(14,2) NOT NULL CHECK (viacard >= 0),
 prod_salone numeric(14,2) NOT NULL CHECK (prod_salone >= 0),
 serv_altro numeric(14,2) NOT NULL CHECK (serv_altro >= 0),
 serv_estetica numeric(14,2) NOT NULL CHECK (serv_estetica >= 0),
 serv_salone numeric(14,2) NOT NULL CHECK (serv_salone >= 0),
 total_gross numeric(14,2) NOT NULL CHECK (total_gross = viacard + prod_salone + serv_altro + serv_estetica + serv_salone),
 source_batch text NOT NULL,
 PRIMARY KEY (salon_id, day)
);
COMMENT ON TABLE public.legacy_turnover_daily IS 'Storico giornaliero incasso IVA inclusa; non sono vendite fiscali, né imponibile/IVA/sconti/scontrini.';
ALTER TABLE public.legacy_turnover_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legacy_turnover_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.legacy_turnover_daily TO service_role;

-- The 1,224 source rows were applied through the private import, not stored in Git.
