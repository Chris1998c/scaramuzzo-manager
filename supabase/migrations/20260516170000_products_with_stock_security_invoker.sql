BEGIN;

-- Allinea products_with_stock a movimenti_view: RLS del chiamante su products + product_stock.
ALTER VIEW public.products_with_stock SET (security_invoker = true);

GRANT SELECT ON public.products_with_stock TO authenticated;

COMMIT;
