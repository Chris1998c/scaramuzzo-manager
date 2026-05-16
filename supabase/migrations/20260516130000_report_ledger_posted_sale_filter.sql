BEGIN;

-- Fatturato report: ledger posted sale (NON fiscal_status).
-- Esclude void/return/correction; include fiscal_status not_required se status=posted e operation_type=sale.

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
  WITH src AS (
    SELECT
      si.id AS sale_item_id,
      s.id AS sale_id,
      s.salon_id,
      (s.date::date) AS sale_day,
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
      coalesce(si.discount, 0)::numeric AS item_discount,
      coalesce(
        CASE
          WHEN si.service_id IS NOT NULL THEN sv.vat_rate
          WHEN si.product_id IS NOT NULL THEN p.vat_rate
          ELSE 0
        END,
        0
      )::numeric AS vat_rate
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    LEFT JOIN public.staff st ON st.id = si.staff_id
    LEFT JOIN public.products p ON p.id = si.product_id
    LEFT JOIN public.services sv ON sv.id = si.service_id
    WHERE
      s.salon_id = p_salon_id
      AND s.date::date >= p_from
      AND s.date::date <= p_to
      AND lower(coalesce(s.status, 'posted')) = 'posted'
      AND lower(coalesce(s.operation_type, 'sale')) = 'sale'
      AND (p_staff_id IS NULL OR si.staff_id = p_staff_id)
      AND (
        p_payment_method IS NULL
        OR lower(s.payment_method) = lower(p_payment_method)
      )
      AND (
        p_item_type IS NULL
        OR (p_item_type = 'service' AND si.service_id IS NOT NULL)
        OR (p_item_type = 'product' AND si.product_id IS NOT NULL)
      )
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
    round((price * quantity - item_discount)::numeric, 2) AS line_total_gross,
    CASE
      WHEN vat_rate > 0 THEN
        round(((price * quantity - item_discount) / (1 + (vat_rate / 100)))::numeric, 2)
      ELSE
        round((price * quantity - item_discount)::numeric, 2)
    END AS line_net,
    CASE
      WHEN vat_rate > 0 THEN
        round(
          (
            (price * quantity - item_discount)
            - ((price * quantity - item_discount) / (1 + (vat_rate / 100)))
          )::numeric,
          2
        )
      ELSE
        0::numeric
    END AS line_vat
  FROM src
  ORDER BY sale_day ASC, sale_id ASC, sale_item_id ASC;
$function$;

COMMENT ON FUNCTION public.report_rows(integer, date, date, integer, text, text) IS
  'Righe fatturato per report: solo sales.status=posted e operation_type=sale (no fiscal_status filter).';

CREATE OR REPLACE VIEW public.sale_items_report AS
SELECT
  si.id AS sale_item_id,
  s.id AS sale_id,
  s.salon_id,
  date(s.created_at) AS sale_day,
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
  coalesce(si.discount, 0::numeric) AS item_discount,
  CASE
    WHEN si.product_id IS NOT NULL THEN p.vat_rate
    WHEN si.service_id IS NOT NULL THEN sv.vat_rate
    ELSE 22::numeric
  END AS vat_rate,
  round(((si.price * si.quantity::numeric) - coalesce(si.discount, 0::numeric)), 2) AS line_total_gross,
  round(
    (
      ((si.price * si.quantity::numeric) - coalesce(si.discount, 0::numeric))
      / (
        1::numeric + (
          CASE
            WHEN si.product_id IS NOT NULL THEN p.vat_rate
            WHEN si.service_id IS NOT NULL THEN sv.vat_rate
            ELSE 22::numeric
          END / 100.0
        )
      )
    ),
    2
  ) AS line_net,
  round(
    (
      ((si.price * si.quantity::numeric) - coalesce(si.discount, 0::numeric))
      - (
        ((si.price * si.quantity::numeric) - coalesce(si.discount, 0::numeric))
        / (
          1::numeric + (
            CASE
              WHEN si.product_id IS NOT NULL THEN p.vat_rate
              WHEN si.service_id IS NOT NULL THEN sv.vat_rate
              ELSE 22::numeric
            END / 100.0
          )
        )
      )
    ),
    2
  ) AS line_vat
FROM public.sale_items si
JOIN public.sales s ON s.id = si.sale_id
LEFT JOIN public.products p ON p.id = si.product_id
LEFT JOIN public.services sv ON sv.id = si.service_id
LEFT JOIN public.staff st ON st.id = si.staff_id
WHERE
  lower(coalesce(s.status, 'posted')) = 'posted'
  AND lower(coalesce(s.operation_type, 'sale')) = 'sale';

COMMENT ON VIEW public.sale_items_report IS
  'Vista righe vendita per report staff/servizi: solo posted sale (ledger), senza filtro fiscal_status.';

COMMIT;
