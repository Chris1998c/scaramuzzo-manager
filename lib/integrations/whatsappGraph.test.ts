import { describe, expect, it } from "vitest";

import {
  maskWhatsAppToDigits,
  normalizePhoneForWhatsAppTo,
  parseWhatsAppGraphErrorPayload,
} from "@/lib/integrations/whatsappGraph";

describe("normalizePhoneForWhatsAppTo", () => {
  it("3895817411 → 393895817411", () => {
    expect(normalizePhoneForWhatsAppTo("3895817411")).toBe("393895817411");
  });

  it("+39 389-581 7411 → 393895817411", () => {
    expect(normalizePhoneForWhatsAppTo("+39 389-581 7411")).toBe("393895817411");
  });

  it("393895817411 resta internazionale", () => {
    expect(normalizePhoneForWhatsAppTo("393895817411")).toBe("393895817411");
  });

  it("00393331234567 → 393331234567", () => {
    expect(normalizePhoneForWhatsAppTo("00393331234567")).toBe("393331234567");
  });
});

describe("maskWhatsAppToDigits", () => {
  it("maschera senza esporre numero completo", () => {
    expect(maskWhatsAppToDigits("393895817411")).toMatch(/^\d{2}\*\*\*\d{3}$/);
  });
});

describe("parseWhatsAppGraphErrorPayload", () => {
  it("estrae code e message Meta", () => {
    const d = parseWhatsAppGraphErrorPayload(
      {
        error: {
          message: "Invalid parameter",
          code: 100,
          error_subcode: 33,
          type: "OAuthException",
          fbtrace_id: "trace123",
        },
      },
      400,
    );
    expect(d.message).toContain("Invalid parameter");
    expect(d.code).toBe(100);
    expect(d.errorSubcode).toBe(33);
    expect(d.httpStatus).toBe(400);
    expect(d.fbtraceId).toBe("trace123");
  });
});
