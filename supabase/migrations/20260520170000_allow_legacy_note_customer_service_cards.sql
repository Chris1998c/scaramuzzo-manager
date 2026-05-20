-- Consente storico Boss legacy in customer_service_cards (solo consultazione; non schede moderne).

ALTER TABLE public.customer_service_cards
  DROP CONSTRAINT IF EXISTS customer_service_cards_service_type_check;

ALTER TABLE public.customer_service_cards
  ADD CONSTRAINT customer_service_cards_service_type_check
  CHECK (
    service_type = ANY (
      ARRAY[
        'oxidation'::text,
        'direct'::text,
        'botanicals'::text,
        'gloss'::text,
        'lightening'::text,
        'keratin'::text,
        'treatment'::text,
        'legacy_note'::text
      ]
    )
  );
