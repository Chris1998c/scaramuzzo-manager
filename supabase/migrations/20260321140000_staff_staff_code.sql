-- Codice identificativo gestionale obbligatorio e univoco (globale, non per salone).

-- 1) Aggiunge la colonna senza vincoli, così le righe esistenti restano valide.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS staff_code text;

-- 2) Backfill deterministico: una riga = un codice univoco (basato sulla PK).
UPDATE public.staff
SET staff_code = 'STF-' || id::text
WHERE staff_code IS NULL;

-- 3) Da questo punto ogni riga ha un valore; i nuovi insert dovranno fornire staff_code.
ALTER TABLE public.staff
  ALTER COLUMN staff_code SET NOT NULL;

-- 4) Univocità globale su tutta la tabella (crea anche indice univoco implicito).
ALTER TABLE public.staff
  ADD CONSTRAINT staff_staff_code_key UNIQUE (staff_code);
