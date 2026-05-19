-- Review manuale + candidati pronti per catalogo master (nessuna scrittura su products).

CREATE TABLE public.products_import_manual_review (
  id bigserial PRIMARY KEY,
  name_normalized text NOT NULL,
  suggested_action text NOT NULL,
  manual_canonical_name text,
  manual_category text,
  manual_usage_type text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_import_manual_review_name_unique UNIQUE (name_normalized)
);

COMMENT ON TABLE public.products_import_manual_review IS
  'Decisioni manuali da CSV review (prefilled). Solo service_role; non scrive su products.';

ALTER TABLE public.products_import_manual_review ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.products_import_manual_review FROM anon, authenticated;
GRANT ALL ON TABLE public.products_import_manual_review TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.products_import_manual_review_id_seq TO service_role;

CREATE OR REPLACE VIEW public.products_import_ready_candidates AS
WITH eligible_manual AS (
  SELECT
    m.name_normalized,
    m.suggested_action,
    m.manual_canonical_name,
    m.manual_category,
    m.manual_usage_type
  FROM public.products_import_manual_review AS m
  WHERE
    m.suggested_action IN ('import', 'keep_exact', 'merge_generic')
    AND coalesce(trim(m.manual_category), '') <> ''
    AND coalesce(trim(m.manual_usage_type), '') <> ''
),
raw_stock AS (
  SELECT
    r.name_normalized,
    r.source_salon_id,
    r.source_salon_name,
    r.name_raw,
    r.qty,
    r.price,
    r.cost
  FROM public.products_import_raw AS r
  WHERE
    r.source = 'boss'
    AND coalesce(r.qty, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.products_import_noise_candidates AS n
      WHERE n.name_normalized = r.name_normalized
    )
),
joined AS (
  SELECT
    em.suggested_action,
    em.manual_canonical_name,
    em.manual_category,
    em.manual_usage_type,
    em.name_normalized,
    rs.source_salon_id,
    rs.source_salon_name,
    rs.name_raw,
    rs.qty,
    rs.price,
    rs.cost,
    CASE
      WHEN
        em.suggested_action = 'merge_generic'
        AND nullif(trim(em.manual_canonical_name), '') IS NOT NULL
        THEN lower(trim(em.manual_canonical_name))
      ELSE em.name_normalized
    END AS group_key
  FROM eligible_manual AS em
  INNER JOIN raw_stock AS rs ON rs.name_normalized = em.name_normalized
)
SELECT
  coalesce(
    nullif(trim(max(j.manual_canonical_name)), ''),
    (array_agg(j.name_raw ORDER BY length(j.name_raw) DESC, j.name_raw))[1]
  ) AS canonical_name,
  max(j.manual_usage_type) AS usage_type,
  max(j.manual_category) AS product_category,
  max(j.suggested_action) AS canonical_strategy,
  array_agg(DISTINCT j.source_salon_id ORDER BY j.source_salon_id) AS salons_present,
  coalesce(sum(j.qty), 0)::numeric AS total_qty,
  round(avg(j.price) FILTER (WHERE j.price IS NOT NULL AND j.price > 0), 2) AS avg_price,
  round(avg(j.cost) FILTER (WHERE j.cost IS NOT NULL AND j.cost > 0), 2) AS avg_cost,
  array_agg(DISTINCT j.name_raw ORDER BY j.name_raw) AS source_names,
  array_agg(DISTINCT j.source_salon_name ORDER BY j.source_salon_name) AS source_salons,
  count(*)::int AS raw_rows_count,
  array_agg(DISTINCT j.name_normalized ORDER BY j.name_normalized) AS source_name_keys
FROM joined AS j
GROUP BY j.group_key, j.suggested_action
HAVING coalesce(sum(j.qty), 0) > 0;

COMMENT ON VIEW public.products_import_ready_candidates IS
  'Candidati catalogo master: review manuale + raw con qty>0, no noise. merge_generic per manual_canonical_name; keep_exact/import per name_normalized.';

REVOKE ALL ON public.products_import_ready_candidates FROM anon, authenticated;
GRANT SELECT ON public.products_import_ready_candidates TO service_role;

NOTIFY pgrst, 'reload schema';
