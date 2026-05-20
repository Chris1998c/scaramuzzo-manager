-- Allinea CHECK service_type a UI moderna + legacy Boss; legacy_note read-only per staff.

ALTER TABLE public.customer_service_cards
  DROP CONSTRAINT IF EXISTS customer_service_cards_service_type_check;

ALTER TABLE public.customer_service_cards
  ADD CONSTRAINT customer_service_cards_service_type_check
  CHECK (
    service_type = ANY (
      ARRAY[
        'oxidation'::text,
        'oxidation_color'::text,
        'direct'::text,
        'direct_color'::text,
        'botanicals'::text,
        'gloss'::text,
        'lightening'::text,
        'keratin'::text,
        'treatment'::text,
        'legacy_note'::text
      ]
    )
  );

COMMENT ON CONSTRAINT customer_service_cards_service_type_check ON public.customer_service_cards IS
  'UI moderna: oxidation_color, gloss, lightening, keratin, botanicals (+ direct_color). Legacy DB: oxidation, direct. Storico Boss: legacy_note (solo import service_role).';

-- INSERT: staff non può creare legacy_note (solo script con service_role).
DROP POLICY IF EXISTS customer_service_cards_insert_staff ON public.customer_service_cards;

CREATE POLICY customer_service_cards_insert_staff
  ON public.customer_service_cards
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff()
    AND service_type <> 'legacy_note'
  );

-- UPDATE: staff non modifica righe legacy né converte schede in legacy_note.
DROP POLICY IF EXISTS customer_service_cards_update_staff ON public.customer_service_cards;

CREATE POLICY customer_service_cards_update_staff
  ON public.customer_service_cards
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.is_staff()
    AND service_type <> 'legacy_note'
  )
  WITH CHECK (
    public.is_staff()
    AND service_type <> 'legacy_note'
  );

-- DELETE: admin non elimina storico Boss legacy.
DROP POLICY IF EXISTS customer_service_cards_delete_admin ON public.customer_service_cards;

CREATE POLICY customer_service_cards_delete_admin
  ON public.customer_service_cards
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    (public.is_coordinator() OR public.is_magazzino())
    AND service_type <> 'legacy_note'
  );
