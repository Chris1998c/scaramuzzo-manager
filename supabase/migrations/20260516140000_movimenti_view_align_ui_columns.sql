BEGIN;

-- Allinea movimenti_view al contratto UI (quantity, movement_type IT, reason).
-- stock_movements resta EN (load/unload/transfer/sale); traduzione solo in lettura.
-- DROP necessario: CREATE OR REPLACE non consente rename qty -> quantity.

DROP VIEW IF EXISTS public.movimenti_view;

CREATE VIEW public.movimenti_view AS
SELECT
  sm.id,
  sm.created_at,
  sm.product_id,
  p.name AS product_name,
  p.category,
  sm.quantity AS quantity,
  CASE lower(btrim(sm.movement_type))
    WHEN 'load' THEN 'carico'
    WHEN 'unload' THEN 'scarico'
    WHEN 'transfer' THEN 'trasferimento'
    WHEN 'sale' THEN 'vendita'
    WHEN 'carico' THEN 'carico'
    WHEN 'scarico' THEN 'scarico'
    WHEN 'trasferimento' THEN 'trasferimento'
    ELSE lower(btrim(sm.movement_type))
  END AS movement_type,
  sm.from_salon,
  sm.to_salon,
  sm.reason
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id
ORDER BY sm.created_at DESC;

ALTER VIEW public.movimenti_view SET (security_invoker = true);

COMMIT;
