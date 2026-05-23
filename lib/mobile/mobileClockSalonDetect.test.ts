import { describe, expect, it } from "vitest";

import {
  CLOCK_GEOFENCE_MAX_METERS,
  detectClockSalonFromGps,
  SEEDED_SALON_GEO,
} from "@/lib/mobile/mobileClockSalonDetect";

describe("detectClockSalonFromGps", () => {
  const romaGps = { lat: SEEDED_SALON_GEO.roma.lat, lng: SEEDED_SALON_GEO.roma.lng };

  it("staff autorizzato a 4 saloni, GPS a Roma → timbra Roma", () => {
    const r = detectClockSalonFromGps(romaGps.lat, romaGps.lng, [
      SEEDED_SALON_GEO.roma,
      SEEDED_SALON_GEO.corigliano,
      SEEDED_SALON_GEO.castrovillari,
      SEEDED_SALON_GEO.cosenza,
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.salonId).toBe(1);
      expect(r.salonName).toBe("Roma");
      expect(r.distanceMeters).toBeLessThanOrEqual(CLOCK_GEOFENCE_MAX_METERS);
    }
  });

  it("staff autorizzato solo Corigliano, GPS a Roma → 403 out_of_geofence", () => {
    const r = detectClockSalonFromGps(romaGps.lat, romaGps.lng, [SEEDED_SALON_GEO.corigliano]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("out_of_geofence");
      expect(r.nearestSalonId).toBe(2);
      expect(r.distanceMeters).toBeGreaterThan(CLOCK_GEOFENCE_MAX_METERS);
    }
  });

  it("staff multi-salone, GPS lontano da tutti i saloni → 403", () => {
    const r = detectClockSalonFromGps(45.0, 9.0, [
      SEEDED_SALON_GEO.roma,
      SEEDED_SALON_GEO.corigliano,
      SEEDED_SALON_GEO.castrovillari,
      SEEDED_SALON_GEO.cosenza,
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("out_of_geofence");
    }
  });

  it("GPS vicino Roma con salon_id client errato (Corigliano) → backend usa Roma", () => {
    const clientWrongSalonId = 2;
    expect(clientWrongSalonId).toBe(SEEDED_SALON_GEO.corigliano.id);

    const r = detectClockSalonFromGps(romaGps.lat, romaGps.lng, [
      SEEDED_SALON_GEO.roma,
      SEEDED_SALON_GEO.corigliano,
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.salonId).toBe(SEEDED_SALON_GEO.roma.id);
      expect(r.salonId).not.toBe(clientWrongSalonId);
    }
  });

  it("due saloni autorizzati: sceglie il più vicino entro geofence", () => {
    const nearRoma = { lat: 41.897, lng: 12.471 };
    const r = detectClockSalonFromGps(nearRoma.lat, nearRoma.lng, [
      SEEDED_SALON_GEO.roma,
      SEEDED_SALON_GEO.corigliano,
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.salonId).toBe(1);
    }
  });
});
