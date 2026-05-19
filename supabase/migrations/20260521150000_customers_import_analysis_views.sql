-- Analisi read-only su staging import clienti Boss (nessun accesso a public.customers).
-- View leggere: niente MATERIALIZED, niente colonna raw jsonb.

CREATE OR REPLACE VIEW public.customers_import_ready_candidates AS
WITH phone_counts AS (
  SELECT phone_normalized, count(*)::int AS cnt
  FROM public.customers_import_raw
  WHERE source = 'boss' AND phone_normalized IS NOT NULL
  GROUP BY phone_normalized
),
email_counts AS (
  SELECT email_normalized, count(*)::int AS cnt
  FROM public.customers_import_raw
  WHERE source = 'boss' AND email_normalized IS NOT NULL
  GROUP BY email_normalized
)
SELECT
  r.id,
  r.source,
  r.source_row_number,
  r.nominativo_raw,
  r.first_name_guess,
  r.last_name_guess,
  r.phone_normalized,
  r.email_normalized,
  r.birth_date,
  r.import_warnings,
  (
    'birth_date_fake' = ANY (r.import_warnings)
    OR 'phone_invalid' = ANY (r.import_warnings)
    OR 'email_invalid' = ANY (r.import_warnings)
  ) AS has_important_warning,
  CASE
    WHEN r.phone_normalized IS NOT NULL AND pc.cnt = 1 THEN 'unique_phone'
    WHEN
      r.phone_normalized IS NULL
      AND r.email_normalized IS NOT NULL
      AND ec.cnt = 1
      THEN 'unique_email_only'
  END AS ready_reason
FROM public.customers_import_raw AS r
LEFT JOIN phone_counts AS pc ON pc.phone_normalized = r.phone_normalized
LEFT JOIN email_counts AS ec ON ec.email_normalized = r.email_normalized
WHERE
  r.source = 'boss'
  AND (
    (r.phone_normalized IS NOT NULL AND pc.cnt = 1)
    OR (
      r.phone_normalized IS NULL
      AND r.email_normalized IS NOT NULL
      AND ec.cnt = 1
    )
  );

COMMENT ON VIEW public.customers_import_ready_candidates IS
  'Record Boss con contatto univoco: telefono unico (A) oppure email unica senza telefono (B). Solo lettura tecnica.';

CREATE OR REPLACE VIEW public.customers_import_duplicate_phone AS
SELECT
  r.phone_normalized,
  count(*)::int AS duplicate_count,
  min(r.source_row_number) AS first_source_row_number,
  max(r.source_row_number) AS last_source_row_number,
  (array_agg(r.nominativo_raw ORDER BY r.source_row_number))[1] AS first_nominativo,
  (array_agg(r.nominativo_raw ORDER BY r.source_row_number DESC))[1] AS last_nominativo
FROM public.customers_import_raw AS r
WHERE r.source = 'boss' AND r.phone_normalized IS NOT NULL
GROUP BY r.phone_normalized
HAVING count(*) > 1;

COMMENT ON VIEW public.customers_import_duplicate_phone IS
  'Gruppi telefono normalizzato con più record (C). Solo metadati leggeri, no jsonb raw.';

CREATE OR REPLACE VIEW public.customers_import_duplicate_email AS
SELECT
  r.email_normalized,
  count(*)::int AS duplicate_count,
  min(r.source_row_number) AS first_source_row_number,
  max(r.source_row_number) AS last_source_row_number,
  (array_agg(r.nominativo_raw ORDER BY r.source_row_number))[1] AS first_nominativo,
  (array_agg(r.nominativo_raw ORDER BY r.source_row_number DESC))[1] AS last_nominativo
FROM public.customers_import_raw AS r
WHERE r.source = 'boss' AND r.email_normalized IS NOT NULL
GROUP BY r.email_normalized
HAVING count(*) > 1;

COMMENT ON VIEW public.customers_import_duplicate_email IS
  'Gruppi email normalizzata con più record (D). Solo metadati leggeri, no jsonb raw.';

CREATE OR REPLACE VIEW public.customers_import_no_contact AS
SELECT
  r.id,
  r.source,
  r.source_row_number,
  r.nominativo_raw,
  r.notes_raw,
  r.import_warnings,
  r.is_valid
FROM public.customers_import_raw AS r
WHERE
  r.source = 'boss'
  AND r.phone_normalized IS NULL
  AND r.email_normalized IS NULL;

COMMENT ON VIEW public.customers_import_no_contact IS
  'Record senza telefono né email normalizzati (E).';

CREATE OR REPLACE VIEW public.customers_import_warning_summary AS
SELECT
  w.warning_code,
  count(*)::bigint AS record_count
FROM public.customers_import_raw AS r
CROSS JOIN LATERAL unnest(r.import_warnings) AS w (warning_code)
WHERE r.source = 'boss'
GROUP BY w.warning_code
ORDER BY count(*) DESC, w.warning_code;

COMMENT ON VIEW public.customers_import_warning_summary IS
  'Conteggi aggregati per codice warning (F e altri).';

-- Grant solo service_role (stesso modello della tabella staging).
REVOKE ALL ON public.customers_import_ready_candidates FROM anon, authenticated;
REVOKE ALL ON public.customers_import_duplicate_phone FROM anon, authenticated;
REVOKE ALL ON public.customers_import_duplicate_email FROM anon, authenticated;
REVOKE ALL ON public.customers_import_no_contact FROM anon, authenticated;
REVOKE ALL ON public.customers_import_warning_summary FROM anon, authenticated;

GRANT SELECT ON public.customers_import_ready_candidates TO service_role;
GRANT SELECT ON public.customers_import_duplicate_phone TO service_role;
GRANT SELECT ON public.customers_import_duplicate_email TO service_role;
GRANT SELECT ON public.customers_import_no_contact TO service_role;
GRANT SELECT ON public.customers_import_warning_summary TO service_role;

NOTIFY pgrst, 'reload schema';
