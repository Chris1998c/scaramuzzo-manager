-- Sprint A pre-UI premium: RLS transfers write lockdown + inventario catalog RPC paginato.
--
-- Verification (post-apply):
--   SELECT has_table_privilege('authenticated', 'public.transfers', 'INSERT');  -- expect false
--   SELECT has_table_privilege('authenticated', 'public.transfer_items', 'UPDATE'); -- expect false
--   SELECT proname FROM pg_proc WHERE proname = 'list_inventario_catalog';

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) RLS hardening: transfers / transfer_items — solo SELECT via policy, no client writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS transfers_insert ON public.transfers;
DROP POLICY IF EXISTS transfers_update ON public.transfers;
DROP POLICY IF EXISTS transfers_delete ON public.transfers;
DROP POLICY IF EXISTS transfer_items_insert ON public.transfer_items;
DROP POLICY IF EXISTS transfer_items_update ON public.transfer_items;
DROP POLICY IF EXISTS transfer_items_delete ON public.transfer_items;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.transfers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.transfer_items FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Inventario catalog paginato (name + barcode + sottoscorta server-side)
-- ---------------------------------------------------------------------------
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
SECURITY INVOKER
SET search_path = public
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

  IF NOT public.can_access_salon(p_salon_id) THEN
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
  )
  SELECT count(*)::bigint INTO v_total FROM filtered;

  SELECT count(*)::bigint INTO v_sottoscorta FROM base WHERE quantity <= 5;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', f.product_id,
        'name', f.name,
        'category', f.category,
        'barcode', f.barcode,
        'quantity', f.quantity
      )
      ORDER BY f.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT product_id, name, category, barcode, quantity
    FROM filtered
    ORDER BY name ASC
    LIMIT v_page_size OFFSET v_offset
  ) f;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', v_total,
    'sottoscorta_count', v_sottoscorta,
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
