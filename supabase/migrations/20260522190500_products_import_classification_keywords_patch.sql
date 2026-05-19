-- Patch keyword conservative (consumabili, erbe, attrezzatura, accessori).

CREATE OR REPLACE FUNCTION public.products_import_classify_product_category(
  p_name_normalized text,
  p_categories text[]
)
RETURNS TABLE (
  product_category text,
  category_confidence text,
  category_rules text[]
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_name text := lower(coalesce(p_name_normalized, ''));
  v_blob text := lower(coalesce(array_to_string(p_categories, ' | '), ''));
  v_search text;
  v_rules text[] := '{}';
  v_cat text := 'unknown';
  v_conf text := 'low';
BEGIN
  v_search := v_name || ' ' || v_blob;

  IF v_name = '' THEN
    product_category := 'unknown';
    category_confidence := 'low';
    category_rules := ARRAY['category:empty_name']::text[];
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_search ~ '(ossigeno|ossigeni|activator|developer|peroxide|perossido|oss\s*[0-9])' THEN
    v_cat := 'ossigeni';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_ossigeni');
  ELSIF v_search ~ '(decolorante|decolorazione|bleach|lightener|deco\b|polvere decolor)' THEN
    v_cat := 'decolorazione';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_decolorazione');
  ELSIF v_search ~ '(direct color|j color|joc color|tinta|tintura|\btinta\b|colore\b|colorante|crema color|nutris color|permanente color)' THEN
    v_cat := 'colori';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_colori');
  ELSIF v_search ~ '(gloss|tonalizzante|toner\b|pearl gloss)' THEN
    v_cat := 'gloss_tonalizzanti';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_gloss_tonalizzanti');
  ELSIF v_search ~ '(henne|henné|lawsonia|indigo|mallo|erbe\b|cassia|bicchiere henne|miscele erbe)' THEN
    v_cat := 'erbe';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_erbe');
  ELSIF v_search ~ '(conditioner|condizionante|maschera|mask\b)' AND v_search !~ 'mascara' THEN
    v_cat := 'conditioner_maschere';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_conditioner_maschere');
  ELSIF v_search ~ '(shampoo|bagnoschiuma|docciaschiuma)' THEN
    v_cat := 'lavaggio';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_lavaggio');
  ELSIF v_search ~ '(lacca|gel\b|gels\b|cera\b|mousse|pasta modell|paste modell|wax\b|spray.*(forte|extra|styling|fiss)|styling)' THEN
    v_cat := 'styling';
    v_conf := 'medium';
    v_rules := array_append(v_rules, 'category:keyword_styling');
  ELSIF v_search ~ '(bond|repair|keratin|keratina|trattamento|filler|botox|ricostru|ristruttur)' THEN
    v_cat := 'trattamenti';
    v_conf := 'medium';
    v_rules := array_append(v_rules, 'category:keyword_trattamenti');
  ELSIF v_search ~ '(phon|piastra|forbice|forbici|spazzola|pettine|tagliacapelli|lama\b|sgorbia)' THEN
    v_cat := 'attrezzatura';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_attrezzatura');
  ELSIF v_search ~ '(guanti|buste|bicchier|bicchiere|carta\b|stagnola|mantella|asciugamano|spazzatura|telo\b|cuffia|cuffiet|foulard|salviette)' THEN
    v_cat := 'consumabili';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_consumabili');
  ELSIF v_search ~ '(candeggina|alcool|disinfettante|detergente|sapone mani|igienizz)' THEN
    v_cat := 'pulizia';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_pulizia');
  ELSIF v_search ~ '(profumo|eau de parfum|fragranza)' THEN
    v_cat := 'profumi';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_profumi');
  ELSIF v_search ~ '(clip\b|becchi oca|elastici|mollette|espositore)' THEN
    v_cat := 'accessori';
    v_conf := 'high';
    v_rules := array_append(v_rules, 'category:keyword_accessori');
  ELSIF v_search ~ '(crema|body\b|scrub|olio\b|solare|abbronzante|corpo\b|viso\b|manicure|pedicure)' THEN
    v_cat := 'cosmetica';
    v_conf := 'medium';
    v_rules := array_append(v_rules, 'category:keyword_cosmetica');
  ELSIF v_search ~ '(spray|lotion|lozione|siero|serum|ampoll)' THEN
    v_cat := 'trattamenti';
    v_conf := 'low';
    v_rules := array_append(v_rules, 'category:keyword_trattamenti_weak');
  ELSIF length(v_name) < 4 OR v_name ~ '^(varie|altro|diversi|kit\b|set\b)$' THEN
    v_cat := 'altro';
    v_conf := 'low';
    v_rules := array_append(v_rules, 'category:generic_or_short_name');
  ELSE
    v_cat := 'unknown';
    v_conf := 'low';
    v_rules := array_append(v_rules, 'category:no_keyword_match');
  END IF;

  product_category := v_cat;
  category_confidence := v_conf;
  category_rules := v_rules;
  RETURN NEXT;
END;
$$;

NOTIFY pgrst, 'reload schema';
