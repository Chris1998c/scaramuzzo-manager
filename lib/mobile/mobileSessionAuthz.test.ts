import { afterEach, describe, expect, it } from "vitest";

import {
  resolveMobileSalonIdFromBody,
  resolveMobileStaffId,
  signMobileToken,
} from "@/lib/mobileSession";

/**
 * Due collaboratori di sedi diverse: il JWT di A non può impersonare B
 * né leggere/filtrare il salon_id di B fuori da salon_ids del token.
 */
describe("mobile JWT → staff → salon authz (due sedi)", () => {
  const prev = process.env.MOBILE_JWT_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = prev;
  });

  function tokenFor(sid: number, salonId: number, salonIds: number[]) {
    process.env.MOBILE_JWT_SECRET = "vitest-mobile-jwt-secret-key";
    return signMobileToken({ sid, salon_id: salonId, salon_ids: salonIds });
  }

  it("body staff_id di un collega → 403; identità resta sid del JWT", () => {
    const tokenA = tokenFor(101, 1, [1]);
    const req = new Request("http://localhost/api/mobile/attendance", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const denied = resolveMobileStaffId(req, { staff_id: 202 });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);

    const ok = resolveMobileStaffId(req, { staff_id: 101 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.staffId).toBe(101);
  });

  it("salon_id di un’altra sede fuori da salon_ids → null (403 in route)", () => {
    const tokenA = tokenFor(101, 1, [1]);
    const v = resolveMobileStaffId(
      new Request("http://localhost/x", {
        headers: { Authorization: `Bearer ${tokenA}` },
      }),
      {},
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(resolveMobileSalonIdFromBody(2, v.token)).toBeNull();
    expect(resolveMobileSalonIdFromBody(1, v.token)).toBe(1);
    expect(resolveMobileSalonIdFromBody(undefined, v.token)).toBe(1);
  });

  it("JWT B non può risolvere staff_id di A anche se body.staff_id=A", () => {
    const tokenB = tokenFor(202, 2, [2]);
    const req = new Request("http://localhost/x", {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const denied = resolveMobileStaffId(req, { staff_id: 101 });
    expect(denied.ok).toBe(false);
    const self = resolveMobileStaffId(req, {});
    expect(self.ok).toBe(true);
    if (self.ok) {
      expect(self.staffId).toBe(202);
      expect(resolveMobileSalonIdFromBody(1, self.token)).toBeNull();
    }
  });
});
