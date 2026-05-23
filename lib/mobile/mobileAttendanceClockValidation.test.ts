import { describe, expect, it } from "vitest";

import {
  GPS_MAX_ACCURACY_M,
  parseClockRequestBody,
  rejectMockedLocation,
  rejectPoorGpsAccuracy,
  resolveClockSalonId,
} from "@/lib/mobile/mobileAttendanceClockValidation";

describe("mobileAttendanceClockValidation", () => {
  it("isMocked true → rifiutato", () => {
    const r = rejectMockedLocation(true);
    expect(r.reject).toBe(true);
    if (r.reject) {
      expect(r.error).toMatch(/simulata/i);
    }
  });

  it("accuracy > 100m → rifiutata", () => {
    const r = rejectPoorGpsAccuracy(150, GPS_MAX_ACCURACY_M);
    expect(r.reject).toBe(true);
    if (r.reject) {
      expect(r.error).toMatch(/100/);
    }
  });

  it("accuracy null → consentita", () => {
    expect(rejectPoorGpsAccuracy(null).reject).toBe(false);
  });

  it("parse body legge isMocked e accuracy", () => {
    const p = parseClockRequestBody({
      lat: 41.9,
      lng: 12.5,
      accuracy: 12,
      isMocked: false,
      device_id: "dev-1",
      app_version: "1.0.0",
    });
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.body.accuracyM).toBe(12);
      expect(p.body.isMocked).toBe(false);
      expect(p.body.deviceId).toBe("dev-1");
    }
  });

  it("resolveClockSalonId rispetta salon_ids del token", () => {
    const token = { salon_id: 1, salon_ids: [1, 2] };
    expect(resolveClockSalonId(2, token)).toBe(2);
    expect(resolveClockSalonId(null, token)).toBe(1);
    expect(resolveClockSalonId(99, token)).toBeNull();
  });
});
