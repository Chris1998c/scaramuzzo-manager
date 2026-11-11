import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clockSalonIdsFromLiveAndToken,
  loadMobileLiveStaff,
  resolveLiveMobileSalonId,
} from "@/lib/mobile/mobileLiveStaffGate";
import { signMobileToken, type VerifiedMobileToken } from "@/lib/mobileSession";

function token(partial: Partial<VerifiedMobileToken> & Pick<VerifiedMobileToken, "sid" | "salon_id">): VerifiedMobileToken {
  return {
    sid: partial.sid,
    salon_id: partial.salon_id,
    salon_ids: partial.salon_ids ?? [partial.salon_id],
  };
}

describe("mobileLiveStaffGate — revoke dopo login (token riusato)", () => {
  const prev = process.env.MOBILE_JWT_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (prev === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = prev;
  });

  it("JWT multi-sede: sede revocata da staff_salons → resolveLive null; sede ancora live OK", () => {
    process.env.MOBILE_JWT_SECRET = "vitest-mobile-jwt-secret-key";
    const jwt = signMobileToken({ sid: 10, salon_id: 1, salon_ids: [1, 2] });
    // Payload simulato come dopo verify (salon_ids ancora [1,2])
    const t = token({ sid: 10, salon_id: 1, salon_ids: [1, 2] });
    expect(jwt.split(".").length).toBe(3);

    const liveAfterRevokeSalon2 = [1];
    expect(resolveLiveMobileSalonId(2, t, liveAfterRevokeSalon2)).toBeNull();
    expect(resolveLiveMobileSalonId(1, t, liveAfterRevokeSalon2)).toBe(1);
    expect(resolveLiveMobileSalonId(undefined, t, liveAfterRevokeSalon2)).toBe(1);
  });

  it("senza gate live, resolveMobileSalonIdFromBody sul solo JWT consentirebbe ancora la sede revocata", async () => {
    const { resolveMobileSalonIdFromBody } = await import("@/lib/mobileSession");
    const t = token({ sid: 10, salon_id: 1, salon_ids: [1, 2] });
    // Difetto pre-fix: JWT basta per salon 2
    expect(resolveMobileSalonIdFromBody(2, t)).toBe(2);
    // Gate live: rifiuta
    expect(resolveLiveMobileSalonId(2, t, [1])).toBeNull();
  });

  it("clockSalonIds: esclude sede solo-JWT; se intersezione vuota usa live DB", () => {
    const t = token({ sid: 10, salon_id: 2, salon_ids: [2] });
    expect(clockSalonIdsFromLiveAndToken(t, [1])).toEqual([1]);
    expect(clockSalonIdsFromLiveAndToken(t, [1, 2])).toEqual([2]);
    expect(clockSalonIdsFromLiveAndToken(t, [])).toEqual([]);
  });

  it("loadMobileLiveStaff: inactive / mobile_disabled / ok + live salons", async () => {
    const staffChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
    const salonsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "staff") return staffChain;
        if (table === "staff_salons") {
          return {
            ...salonsChain,
            then: undefined,
            eq: vi.fn().mockResolvedValue({
              data: [{ salon_id: 1 }, { salon_id: 2 }],
              error: null,
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    // inactive
    staffChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 10, salon_id: 1, active: false, mobile_enabled: true },
      error: null,
    });
    expect(await loadMobileLiveStaff(admin as never, 10)).toEqual({
      ok: false,
      reason: "inactive",
    });

    // mobile disabled
    staffChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 10, salon_id: 1, active: true, mobile_enabled: false },
      error: null,
    });
    expect(await loadMobileLiveStaff(admin as never, 10)).toEqual({
      ok: false,
      reason: "mobile_disabled",
    });

    // ok — mock staff_salons as thenable-like supabase builder
    staffChain.maybeSingle.mockResolvedValueOnce({
      data: { id: 10, salon_id: 1, active: true, mobile_enabled: true },
      error: null,
    });
    admin.from = vi.fn((table: string) => {
      if (table === "staff") return staffChain;
      if (table === "staff_salons") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ salon_id: 2 }],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const live = await loadMobileLiveStaff(admin as never, 10);
    expect(live.ok).toBe(true);
    if (live.ok) {
      expect(live.liveSalonIds).toEqual([1, 2]);
      expect(live.primarySalonId).toBe(1);
    }
  });
});
