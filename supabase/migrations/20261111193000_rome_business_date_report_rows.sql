-- Giorno operativo Europe/Rome per timestamp UTC-wall (sales.date / created_at).
-- Non modifica i timestamp storici: solo raggruppamento/filtro in lettura.

CREATE OR REPLACE FUNCTION public.rome_business_date(p_ts timestamp without time zone)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_ts IS NULL THEN NULL
    ELSE ((p_ts AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome')::date
  END;
$$;

COMMENT ON FUNCTION public.rome_business_date(timestamp without time zone) IS
  'Calendario Europe/Rome da timestamp senza tz interpretato come UTC wall (now() su DB UTC).';

REVOKE ALL ON FUNCTION public.rome_business_date(timestamp without time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rome_business_date(timestamp without time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rome_business_date(timestamp without time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.report_rows(
  p_salon_id integer,
  p_from date,
  p_to date,
  p_staff_id integer DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_item_type text DEFAULT NULL
)
RETURNS TABLE (
  sale_item_id integer,
  sale_id integer,
  salon_id integer,
  sale_day date,
  payment_method text,
  staff_id integer,
  staff_name text,
  product_id integer,
  product_name text,
  service_id integer,
  service_name text,
  item_type text,
  quantity numeric,
  price numeric,
  item_discount numeric,
  vat_rate numeric,
  line_total_gross numeric,
  line_net numeric,
  line_vat numeric
)
LANGUAGE sql
STABLE
AS $function$
  WITH base AS (
    SELECT
      si.id AS sale_item_id,
      s.id AS sale_id,
      s.salon_id,
      public.rome_business_date(s.date) AS sale_day,
      lower(coalesce(s.payment_method, '')) AS payment_method,
      si.staff_id,
      st.name AS staff_name,
      si.product_id,
      p.name AS product_name,
      si.service_id,
      sv.name AS service_name,
      CASE
        WHEN si.service_id IS NOT NULL THEN 'service'
        WHEN si.product_id IS NOT NULL THEN 'product'
        ELSE 'unknown'
      END AS item_type,
      coalesce(si.quantity, 1)::numeric AS quantity,
      coalesce(si.price, 0)::numeric AS price,
      coalesce(si.discount, 0)::numeric AS line_discount,
      coalesce(
        CASE
          WHEN si.service_id IS NOT NULL THEN sv.vat_rate
          WHEN si.product_id IS NOT NULL THEN p.vat_rate
          ELSE 0
        END,
        0
      )::numeric AS vat_rate,
      round(
        (
          greatest(
            0::numeric,
            coalesce(si.price, 0)::numeric * coalesce(si.quantity, 1)::numeric
              - coalesce(si.discount, 0)::numeric
          )
        )::numeric,
        2
      ) AS line_base,
      round(greatest(0::numeric, coalesce(s.total_amount, 0))::numeric, 2) AS sale_total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    LEFT JOIN public.staff st ON st.id = si.staff_id
    LEFT JOIN public.products p ON p.id = si.product_id
    LEFT JOIN public.services sv ON sv.id = si.service_id
    WHERE
      s.salon_id = p_salon_id
      AND public.rome_business_date(s.date) >= p_from
      AND public.rome_business_date(s.date) <= p_to
      AND lower(coalesce(s.status, 'posted')) = 'posted'
      AND lower(coalesce(s.operation_type, 'sale')) = 'sale'
      AND (
        p_payment_method IS NULL
        OR lower(s.payment_method) = lower(p_payment_method)
      )
  ),
  cents AS (
    SELECT
      b.*,
      round(b.line_base * 100)::bigint AS base_cents,
      round(b.sale_total * 100)::bigint AS sale_total_cents,
      (sum(round(b.line_base * 100)::bigint) OVER (PARTITION BY b.sale_id))::bigint AS bases_sum_cents
    FROM base b
  ),
  pooled AS (
    SELECT
      c.*,
      GREATEST(
        0::bigint,
        c.bases_sum_cents - GREATEST(c.sale_total_cents, 0::bigint)
      ) AS global_pool_cents
    FROM cents c
  ),
  floored AS (
    SELECT
      p.*,
      CASE
        WHEN p.bases_sum_cents <= 0 OR p.base_cents <= 0 OR p.global_pool_cents <= 0 THEN 0::bigint
        ELSE LEAST(
          p.base_cents,
          (p.global_pool_cents * p.base_cents) / p.bases_sum_cents
        )
      END AS floor_cents,
      CASE
        WHEN p.bases_sum_cents <= 0 OR p.base_cents <= 0 OR p.global_pool_cents <= 0 THEN 0::bigint
        ELSE (p.global_pool_cents * p.base_cents) % p.bases_sum_cents
      END AS rem_cents
    FROM pooled p
  ),
  with_left AS (
    SELECT
      f.*,
      f.global_pool_cents
        - (sum(f.floor_cents) OVER (PARTITION BY f.sale_id))::bigint AS leftover_cents
    FROM floored f
  ),
  ranked AS (
    SELECT
      w.*,
      row_number() OVER (
        PARTITION BY w.sale_id
        ORDER BY
          CASE WHEN w.base_cents > w.floor_cents THEN 0 ELSE 1 END,
          w.rem_cents DESC,
          w.sale_item_id ASC
      ) AS rem_rank
    FROM with_left w
  ),
  allocated AS (
    SELECT
      r.*,
      r.floor_cents
        + CASE
            WHEN r.base_cents > r.floor_cents
              AND r.rem_rank <= r.leftover_cents
            THEN 1::bigint
            ELSE 0::bigint
          END AS global_share_cents
    FROM ranked r
  ),
  priced AS (
    SELECT
      a.sale_item_id,
      a.sale_id,
      a.salon_id,
      a.sale_day,
      a.payment_method,
      a.staff_id,
      a.staff_name,
      a.product_id,
      a.product_name,
      a.service_id,
      a.service_name,
      a.item_type,
      a.quantity,
      a.price,
      a.vat_rate,
      round(((a.base_cents - a.global_share_cents)::numeric) / 100, 2) AS line_total_gross,
      round(
        (
          greatest(
            0::numeric,
            a.price * a.quantity
              - ((a.base_cents - a.global_share_cents)::numeric / 100)
          )
        )::numeric,
        2
      ) AS item_discount
    FROM allocated a
  )
  SELECT
    sale_item_id,
    sale_id,
    salon_id,
    sale_day,
    payment_method,
    staff_id,
    staff_name,
    product_id,
    product_name,
    service_id,
    service_name,
    item_type,
    quantity,
    price,
    item_discount,
    vat_rate,
    line_total_gross,
    CASE
      WHEN vat_rate > 0 THEN
        round((line_total_gross / (1 + (vat_rate / 100)))::numeric, 2)
      ELSE
        line_total_gross
    END AS line_net,
    CASE
      WHEN vat_rate > 0 THEN
        round(
          (
            line_total_gross
            - (line_total_gross / (1 + (vat_rate / 100)))
          )::numeric,
          2
        )
      ELSE
        0::numeric
    END AS line_vat
  FROM priced
  WHERE
    (p_staff_id IS NULL OR staff_id = p_staff_id)
    AND (
      p_item_type IS NULL
      OR (p_item_type = 'service' AND service_id IS NOT NULL)
      OR (p_item_type = 'product' AND product_id IS NOT NULL)
    )
  ORDER BY sale_day ASC, sale_id ASC, sale_item_id ASC;
$function$;


COMMENT ON FUNCTION public.report_rows(integer, date, date, integer, text, text) IS
  'Righe fatturato posted sale; sale_day = rome_business_date(sales.date); sconto globale Hamilton.';

CREATE OR REPLACE VIEW public.sale_items_report AS
WITH base AS (
  SELECT
    si.id AS sale_item_id,
    s.id AS sale_id,
    s.salon_id,
    public.rome_business_date(s.created_at) AS sale_day,
    s.payment_method,
    si.staff_id,
    st.name AS staff_name,
    si.product_id,
    p.name AS product_name,
    si.service_id,
    sv.name AS service_name,
    CASE
      WHEN si.product_id IS NOT NULL THEN 'product'::text
      WHEN si.service_id IS NOT NULL THEN 'service'::text
      ELSE 'unknown'::text
    END AS item_type,
    si.quantity,
    si.price,
    coalesce(si.discount, 0::numeric) AS line_discount,
    CASE
      WHEN si.product_id IS NOT NULL THEN p.vat_rate
      WHEN si.service_id IS NOT NULL THEN sv.vat_rate
      ELSE 22::numeric
    END AS vat_rate,
    round(
      (
        greatest(
          0::numeric,
          (si.price * si.quantity::numeric) - coalesce(si.discount, 0::numeric)
        )
      )::numeric,
      2
    ) AS line_base,
    round(greatest(0::numeric, coalesce(s.total_amount, 0))::numeric, 2) AS sale_total
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  LEFT JOIN public.products p ON p.id = si.product_id
  LEFT JOIN public.services sv ON sv.id = si.service_id
  LEFT JOIN public.staff st ON st.id = si.staff_id
  WHERE
    lower(coalesce(s.status, 'posted')) = 'posted'
    AND lower(coalesce(s.operation_type, 'sale')) = 'sale'
),
cents AS (
  SELECT
    b.*,
    round(b.line_base * 100)::bigint AS base_cents,
    round(b.sale_total * 100)::bigint AS sale_total_cents,
    (sum(round(b.line_base * 100)::bigint) OVER (PARTITION BY b.sale_id))::bigint AS bases_sum_cents
  FROM base b
),
pooled AS (
  SELECT
    c.*,
    GREATEST(
      0::bigint,
      c.bases_sum_cents - GREATEST(c.sale_total_cents, 0::bigint)
    ) AS global_pool_cents
  FROM cents c
),
floored AS (
  SELECT
    p.*,
    CASE
      WHEN p.bases_sum_cents <= 0 OR p.base_cents <= 0 OR p.global_pool_cents <= 0 THEN 0::bigint
      ELSE LEAST(
        p.base_cents,
        (p.global_pool_cents * p.base_cents) / p.bases_sum_cents
      )
    END AS floor_cents,
    CASE
      WHEN p.bases_sum_cents <= 0 OR p.base_cents <= 0 OR p.global_pool_cents <= 0 THEN 0::bigint
      ELSE (p.global_pool_cents * p.base_cents) % p.bases_sum_cents
    END AS rem_cents
  FROM pooled p
),
with_left AS (
  SELECT
    f.*,
    f.global_pool_cents - (sum(f.floor_cents) OVER (PARTITION BY f.sale_id))::bigint AS leftover_cents
  FROM floored f
),
ranked AS (
  SELECT
    w.*,
    row_number() OVER (
      PARTITION BY w.sale_id
      ORDER BY
        CASE WHEN w.base_cents > w.floor_cents THEN 0 ELSE 1 END,
        w.rem_cents DESC,
        w.sale_item_id ASC
    ) AS rem_rank
  FROM with_left w
),
allocated AS (
  SELECT
    r.*,
    r.floor_cents
      + CASE
          WHEN r.base_cents > r.floor_cents
            AND r.rem_rank <= r.leftover_cents
          THEN 1::bigint
          ELSE 0::bigint
        END AS global_share_cents
  FROM ranked r
)
SELECT
  a.sale_item_id,
  a.sale_id,
  a.salon_id,
  a.sale_day,
  a.payment_method,
  a.staff_id,
  a.staff_name,
  a.product_id,
  a.product_name,
  a.service_id,
  a.service_name,
  a.item_type,
  a.quantity,
  a.price,
  round(
    (
      greatest(
        0::numeric,
        (a.price * a.quantity::numeric)
          - ((a.base_cents - a.global_share_cents)::numeric / 100)
      )
    )::numeric,
    2
  ) AS item_discount,
  a.vat_rate,
  round(((a.base_cents - a.global_share_cents)::numeric) / 100, 2) AS line_total_gross,
  round(
    (
      round(((a.base_cents - a.global_share_cents)::numeric) / 100, 2)
      / (1::numeric + (a.vat_rate / 100.0))
    )::numeric,
    2
  ) AS line_net,
  round(
    (
      round(((a.base_cents - a.global_share_cents)::numeric) / 100, 2)
      - (
        round(((a.base_cents - a.global_share_cents)::numeric) / 100, 2)
        / (1::numeric + (a.vat_rate / 100.0))
      )
    )::numeric,
    2
  ) AS line_vat
FROM allocated a;

COMMENT ON VIEW public.sale_items_report IS
  'Vista righe vendita posted sale; sale_day = rome_business_date(created_at); sconto globale Hamilton.';
