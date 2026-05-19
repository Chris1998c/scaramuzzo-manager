-- Analisi read-only su staging import prodotti Boss (nessun accesso a public.products).
-- View leggere: niente MATERIALIZED; similarità conservativa (no fuzzy aggressivo).

CREATE OR REPLACE FUNCTION public.products_import_compact_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(trim(coalesce(p_name, '')), '\s+', '', 'g'),
        '[-–—./''",;:!?()[\]]', '', 'g'
      ),
      '(\d+)\s*(ml|lt|l|gr|g|cl|kg|pz|pcs)\b',
      '\1\2',
      'gi'
    )
  );
$$;

COMMENT ON FUNCTION public.products_import_compact_key(text) IS
  'Chiave similarità conservativa: spazi, punteggiatura, trattini, unità (250 ml → 250ml).';

CREATE OR REPLACE VIEW public.products_import_master_candidates AS
WITH per_name AS (
  SELECT
    r.name_normalized,
    count(*)::int AS total_rows,
    count(DISTINCT r.source_salon_id)::int AS salons_count,
    array_agg(DISTINCT r.source_salon_name ORDER BY r.source_salon_name) AS salons_names,
    coalesce(sum(r.qty), 0)::numeric AS total_qty,
    array_agg(DISTINCT r.category_normalized ORDER BY r.category_normalized)
      FILTER (WHERE r.category_normalized IS NOT NULL AND r.category_normalized <> '') AS categories,
    avg(r.price) FILTER (WHERE r.price IS NOT NULL AND r.price > 0) AS avg_price,
    avg(r.cost) FILTER (WHERE r.cost IS NOT NULL AND r.cost > 0) AS avg_cost,
    bool_and(coalesce(r.qty, 0) = 0) AS has_zero_qty_everywhere,
    bool_or(coalesce(r.category_normalized, '') ILIKE '%uso interno%') AS possible_internal_use,
    bool_or(coalesce(r.category_normalized, '') ILIKE '%rivendita%') AS possible_retail,
    array_agg(DISTINCT r.name_raw ORDER BY r.name_raw) AS source_names,
    (
      array_agg(r.name_raw ORDER BY length(r.name_raw) DESC, r.name_raw)
    )[1] AS candidate_name
  FROM public.products_import_raw AS r
  WHERE
    r.source = 'boss'
    AND r.name_normalized IS NOT NULL
    AND r.name_normalized <> ''
  GROUP BY r.name_normalized
)
SELECT
  pn.name_normalized,
  pn.candidate_name,
  pn.salons_count,
  pn.salons_names,
  pn.total_rows,
  pn.total_qty,
  pn.categories,
  round(pn.avg_price::numeric, 2) AS avg_price,
  round(pn.avg_cost::numeric,  2) AS avg_cost,
  pn.has_zero_qty_everywhere,
  pn.possible_internal_use,
  pn.possible_retail,
  pn.source_names
FROM per_name AS pn;

COMMENT ON VIEW public.products_import_master_candidates IS
  'Candidati catalogo master aggregati per name_normalized (Boss staging).';

CREATE OR REPLACE VIEW public.products_import_similar_candidates AS
WITH name_salons AS (
  SELECT
    r.name_normalized,
    public.products_import_compact_key(r.name_normalized) AS compact_key,
    array_agg(DISTINCT r.source_salon_id ORDER BY r.source_salon_id) AS salon_ids
  FROM public.products_import_raw AS r
  WHERE
    r.source = 'boss'
    AND r.name_normalized IS NOT NULL
    AND r.name_normalized <> ''
  GROUP BY r.name_normalized
),
pairs AS (
  SELECT
    a.name_normalized AS candidate_a,
    b.name_normalized AS candidate_b,
    a.compact_key,
    (
      SELECT count(*)::int
      FROM unnest(a.salon_ids) AS sid
      WHERE sid = ANY (b.salon_ids)
    ) AS salons_overlap,
    CASE
      WHEN replace(a.name_normalized, ' ', '') = replace(b.name_normalized, ' ', '')
        THEN 'spacing'
      WHEN regexp_replace(a.name_normalized, '[-–—]', '', 'g')
        = regexp_replace(b.name_normalized, '[-–—]', '', 'g')
        THEN 'hyphens'
      WHEN regexp_replace(a.name_normalized, '(\d+)\s*(ml|lt|l|gr|g|cl|kg|pz)\b', '\1\2', 'gi')
        = regexp_replace(b.name_normalized, '(\d+)\s*(ml|lt|l|gr|g|cl|kg|pz)\b', '\1\2', 'gi')
        THEN 'unit_spacing'
      WHEN a.name_normalized || 's' = b.name_normalized
        OR b.name_normalized || 's' = a.name_normalized
        THEN 'simple_plural'
      ELSE 'compact_key_match'
    END AS similarity_reason
  FROM name_salons AS a
  INNER JOIN name_salons AS b
    ON
      a.compact_key = b.compact_key
      AND a.name_normalized < b.name_normalized
)
SELECT
  p.candidate_a,
  p.candidate_b,
  p.salons_overlap,
  p.similarity_reason
FROM pairs AS p;

COMMENT ON VIEW public.products_import_similar_candidates IS
  'Coppie nomi simili (compact_key o varianti conservative). Non importare senza review.';

CREATE OR REPLACE VIEW public.products_import_noise_candidates AS
WITH per_name AS (
  SELECT
    m.name_normalized,
    m.candidate_name,
    m.total_rows,
    m.salons_count,
    m.total_qty,
    m.categories,
    m.has_zero_qty_everywhere,
    array_remove(
      array[
        CASE WHEN m.has_zero_qty_everywhere THEN 'zero_qty_everywhere' END,
        CASE WHEN length(m.name_normalized) < 4 THEN 'name_too_short' END,
        CASE WHEN m.name_normalized ~ '^(totali|totale|n\/a|na|test|xxx|\.)$'
          THEN 'name_reserved_or_garbage' END,
        CASE WHEN m.name_normalized ~ '^[0-9]+$' THEN 'name_numeric_only' END,
        CASE
          WHEN m.name_normalized ~ '^(varie|altro|diversi|generico|senza nome|misc)$'
            THEN 'name_too_generic'
        END,
        CASE
          WHEN m.total_qty > 0
            AND (
              m.categories IS NULL
              OR cardinality(m.categories) = 0
            )
            THEN 'category_missing_with_stock'
        END,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM unnest(m.categories) AS c (cat)
            WHERE cat !~ '(uso|rivendita|salone|store|interno)'
          )
            AND m.total_qty = 0
            THEN 'category_unusual_zero_stock'
        END
      ],
      NULL
    ) AS noise_reasons
  FROM public.products_import_master_candidates AS m
)
SELECT
  pn.name_normalized,
  pn.candidate_name,
  pn.noise_reasons,
  pn.total_rows,
  pn.salons_count,
  pn.total_qty,
  pn.categories
FROM per_name AS pn
WHERE cardinality(pn.noise_reasons) > 0;

COMMENT ON VIEW public.products_import_noise_candidates IS
  'Candidati da escludere o rivedere manualmente prima del catalogo master.';

REVOKE ALL ON public.products_import_master_candidates FROM anon, authenticated;
REVOKE ALL ON public.products_import_similar_candidates FROM anon, authenticated;
REVOKE ALL ON public.products_import_noise_candidates FROM anon, authenticated;

GRANT SELECT ON public.products_import_master_candidates TO service_role;
GRANT SELECT ON public.products_import_similar_candidates TO service_role;
GRANT SELECT ON public.products_import_noise_candidates TO service_role;

NOTIFY pgrst, 'reload schema';
