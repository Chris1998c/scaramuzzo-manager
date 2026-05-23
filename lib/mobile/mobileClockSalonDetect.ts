/** Raggio geofence timbratura mobile (allineato a route clock storica). */
export const CLOCK_GEOFENCE_MAX_METERS = 500;

export type SalonGeo = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

export type DetectClockSalonResult =
  | {
      ok: true;
      salonId: number;
      salonName: string;
      distanceMeters: number;
    }
  | {
      ok: false;
      reason: "no_authorized_salons" | "no_coordinates" | "out_of_geofence";
      distanceMeters?: number;
      nearestSalonId?: number;
      nearestSalonName?: string;
    };

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Distanza Haversine in metri tra due punti WGS84. */
export function distanceMetersWgs84(
  lat: number,
  lng: number,
  salonLat: number,
  salonLng: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(salonLat - lat);
  const dLng = toRadians(salonLng - lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat)) *
      Math.cos(toRadians(salonLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

/**
 * Rileva il salone autorizzato più vicino alla posizione GPS.
 * Timbratura OK solo se quel salone (il più vicino) è entro `maxMeters`.
 * Ignora qualsiasi salon_id inviato dal client.
 */
export function detectClockSalonFromGps(
  lat: number,
  lng: number,
  authorizedSalons: SalonGeo[],
  maxMeters: number = CLOCK_GEOFENCE_MAX_METERS,
): DetectClockSalonResult {
  if (!authorizedSalons.length) {
    return { ok: false, reason: "no_authorized_salons" };
  }

  const withCoords: Array<SalonGeo & { distanceMeters: number }> = [];
  for (const salon of authorizedSalons) {
    const salonLat = Number(salon.lat);
    const salonLng = Number(salon.lng);
    if (!Number.isFinite(salonLat) || !Number.isFinite(salonLng)) {
      continue;
    }
    withCoords.push({
      ...salon,
      lat: salonLat,
      lng: salonLng,
      distanceMeters: distanceMetersWgs84(lat, lng, salonLat, salonLng),
    });
  }

  if (!withCoords.length) {
    return { ok: false, reason: "no_coordinates" };
  }

  withCoords.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const nearest = withCoords[0];

  if (nearest.distanceMeters > maxMeters) {
    return {
      ok: false,
      reason: "out_of_geofence",
      distanceMeters: nearest.distanceMeters,
      nearestSalonId: nearest.id,
      nearestSalonName: nearest.name,
    };
  }

  return {
    ok: true,
    salonId: nearest.id,
    salonName: nearest.name,
    distanceMeters: nearest.distanceMeters,
  };
}

/** Coordinate da migration 20260602120000_seed_salon_coordinates.sql (test). */
export const SEEDED_SALON_GEO: Record<"roma" | "corigliano" | "castrovillari" | "cosenza", SalonGeo> = {
  roma: { id: 1, name: "Roma", lat: 41.8966843, lng: 12.4708372 },
  corigliano: { id: 2, name: "Corigliano", lat: 39.6262229, lng: 16.5159274 },
  castrovillari: { id: 3, name: "Castrovillari", lat: 39.8137032, lng: 16.2009537 },
  cosenza: { id: 4, name: "Cosenza", lat: 39.2952045, lng: 16.2526743 },
};
