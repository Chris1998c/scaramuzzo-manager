import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isClaimWhatsAppDeliveryRequired,
  resolveClaimWhatsAppConfig,
} from "@/lib/integrations/whatsappClaimConfig";

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe("resolveClaimWhatsAppConfig", () => {
  it("fallisce se manca template", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    delete process.env.WHATSAPP_OTP_TEMPLATE_NAME;

    const cfg = resolveClaimWhatsAppConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) {
      expect(cfg.code).toBe("whatsapp_template_not_configured");
      expect(cfg.missingEnv).toContain("WHATSAPP_OTP_TEMPLATE_NAME");
    }
  });

  it("ok con env complete", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_OTP_TEMPLATE_NAME = "customer_otp_it";
    process.env.WHATSAPP_OTP_TEMPLATE_LANG = "it";

    const cfg = resolveClaimWhatsAppConfig();
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.templateName).toBe("customer_otp_it");
      expect(cfg.templateLanguageCode).toBe("it");
    }
  });
});

describe("isClaimWhatsAppDeliveryRequired", () => {
  it("true in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.CUSTOMER_CLAIM_WHATSAPP_ALLOW_SKIP;
    expect(isClaimWhatsAppDeliveryRequired()).toBe(true);
  });

  it("false se ALLOW_SKIP", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.CUSTOMER_CLAIM_WHATSAPP_ALLOW_SKIP = "true";
    expect(isClaimWhatsAppDeliveryRequired()).toBe(false);
  });
});
