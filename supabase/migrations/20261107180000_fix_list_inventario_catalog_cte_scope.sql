-- Fix list_inventario_catalog: CTE "base"/"filtered" erano referenziate fuori dallo
-- statement che le definisce → 42P01 relation "base" does not exist su ogni salone.
-- Inoltre can_access_salon deve essere IS TRUE (no bypass su NULL), come close_cash_session.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_inventario_catalog(
  p_salon_id integer,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_sottoscorta_only boolean DEFAULT false,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_offset integer;
  v_total bigint;
  v_sottoscorta bigint;
  v_rows jsonb;
BEGIN
  IF p_salon_id IS NULL OR p_salon_id <= 0 THEN
    RAISE EXCEPTION 'list_inventario_catalog: salon_id richiesto';
  END IF;

  IF public.can_access_salon(p_salon_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'list_inventario_catalog: accesso salone negato';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH base AS (
    SELECT
      p.id AS product_id,
      p.name,
      p.category,
      p.barcode,
      COALESCE(ps.quantity, 0)::numeric AS quantity
    FROM public.products p
    LEFT JOIN public.product_stock ps
      ON ps.product_id = p.id AND ps.salon_id = p_salon_id
    WHERE p.active IS NOT FALSE
      AND (v_category IS NULL OR p.category = v_category)
      AND (
        v_search IS NULL
        OR p.name ILIKE '%' || v_search || '%'
        OR p.barcode ILIKE '%' || v_search || '%'
      )
  ),
  filtered AS (
    SELECT * FROM base
    WHERE NOT COALESCE(p_sottoscorta_only, false) OR quantity <= 5
  ),
  counted AS (
    SELECT
      (SELECT count(*)::bigint FROM filtered) AS total_count,
      (SELECT count(*)::bigint FROM base WHERE quantity <= 5) AS sottoscorta_count
  ),
  page_rows AS (
    SELECT product_id, name, category, barcode, quantity
    FROM filtered
    ORDER BY name ASC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT
    c.total_count,
    c.sottoscorta_count,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'product_id', pr.product_id,
            'name', pr.name,
            'category', pr.category,
            'barcode', pr.barcode,
            'quantity', pr.quantity
          )
          ORDER BY pr.name ASC
        )
        FROM page_rows pr
      ),
      '[]'::jsonb
    )
  INTO v_total, v_sottoscorta, v_rows
  FROM counted c;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'total_count', COALESCE(v_total, 0),
    'sottoscorta_count', COALESCE(v_sottoscorta, 0),
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_inventario_catalog(
  integer, text, text, boolean, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_inventario_catalog(
  integer, text, text, boolean, integer, integer
) TO authenticated, service_role;

COMMIT;
