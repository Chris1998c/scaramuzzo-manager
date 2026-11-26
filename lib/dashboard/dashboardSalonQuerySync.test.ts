import { describe, expect, it } from "vitest";
import {
  nextDashboardSalonQueryId,
  resolveDashboardLinkNavigationSalonId,
  withDashboardSalonHref,
} from "./dashboardSalonQuerySync";

describe("nextDashboardSalonQueryId", () => {
  const allowed = [1, 2, 3, 4, 5];

  it("scrive la sede header quando l’URL manca (ritorno da Report)", () => {
    expect(nextDashboardSalonQueryId(3, null, allowed)).toBe("3");
  });

  it("corregge URL Magazzino Centrale se header è Castrovillari", () => {
    expect(nextDashboardSalonQueryId(3, "5", allowed)).toBe("3");
  });

  it("non riscrive se già allineato", () => {
    expect(nextDashboardSalonQueryId(3, "3", allowed)).toBeNull();
  });

  it("ignora active assente o non consentito", () => {
    expect(nextDashboardSalonQueryId(null, "1", allowed)).toBeNull();
    expect(nextDashboardSalonQueryId(9, "1", allowed)).toBeNull();
  });
});

describe("withDashboardSalonHref", () => {
  it("seed Report/Impostazioni/Presenze con salon_id", () => {
    expect(withDashboardSalonHref("/dashboard/report", 3)).toBe(
      "/dashboard/report?salon_id=3",
    );
    expect(withDashboardSalonHref("/dashboard/impostazioni", 1)).toBe(
      "/dashboard/impostazioni?salon_id=1",
    );
    expect(withDashboardSalonHref("/dashboard/presenze", 2)).toBe(
      "/dashboard/presenze?salon_id=2",
    );
  });

  it("non tocca Marketing o path senza seed", () => {
    expect(withDashboardSalonHref("/dashboard/marketing", 3)).toBe(
      "/dashboard/marketing",
    );
  });
});

describe("resolveDashboardLinkNavigationSalonId — clic prima del sync URL", () => {
  it("Roma→Castrovillari: storage già 3, context/href SSR ancora 1 → naviga 3", () => {
    // Riproduce: setActiveSalonId(3) ha scritto storage; React non ha ancora
    // ri-renderizzato il Link SSR (?salon_id=1) né flushato context.
    expect(
      resolveDashboardLinkNavigationSalonId({
        storedActiveSalonId: 3,
        contextActiveSalonId: 1,
        hrefSalonId: 1,
      }),
    ).toBe(3);
  });

  it("Castrovillari→Roma: storage 1 vince su href stale 3", () => {
    expect(
      resolveDashboardLinkNavigationSalonId({
        storedActiveSalonId: 1,
        contextActiveSalonId: 3,
        hrefSalonId: 3,
      }),
    ).toBe(1);
  });

  it("doppio cambio rapido: ultima sede in storage vince", () => {
    expect(
      resolveDashboardLinkNavigationSalonId({
        storedActiveSalonId: 2,
        contextActiveSalonId: 1,
        hrefSalonId: 3,
      }),
    ).toBe(2);
  });

  it("senza storage usa context, poi href", () => {
    expect(
      resolveDashboardLinkNavigationSalonId({
        storedActiveSalonId: null,
        contextActiveSalonId: 4,
        hrefSalonId: 1,
      }),
    ).toBe(4);
    expect(
      resolveDashboardLinkNavigationSalonId({
        storedActiveSalonId: null,
        contextActiveSalonId: null,
        hrefSalonId: 1,
      }),
    ).toBe(1);
  });
});
