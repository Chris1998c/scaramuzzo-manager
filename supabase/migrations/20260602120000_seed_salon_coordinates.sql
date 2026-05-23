-- Coordinate WGS84 per geofence Team App (public.salons.lat / public.salons.lng).
-- Fonte: OpenStreetMap Nominatim (geocoding indirizzi ufficiali, 2026-06).
-- Idempotente: UPDATE per id salone; rieseguibile senza effetti collaterali.
-- Non modifica radius_m né salone 5 (Magazzino Centrale).

BEGIN;

-- 1 Roma — Via del Pellegrino 101, 00186 Roma
UPDATE public.salons
SET
  lat = 41.8966843,
  lng = 12.4708372
WHERE id = 1;

-- 2 Corigliano — Via Nazionale 70, 87064 Corigliano Scalo (Corigliano-Rossano)
UPDATE public.salons
SET
  lat = 39.6262229,
  lng = 16.5159274
WHERE id = 2;

-- 3 Castrovillari — Corso Giuseppe Garibaldi 13, 87012 Castrovillari
UPDATE public.salons
SET
  lat = 39.8137032,
  lng = 16.2009537
WHERE id = 3;

-- 4 Cosenza — Via Monte San Michele 13, 87100 Cosenza
UPDATE public.salons
SET
  lat = 39.2952045,
  lng = 16.2526743
WHERE id = 4;

COMMIT;
