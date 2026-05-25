import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/whatsappGraph", () => ({
  normalizePhoneForWhatsAppTo: vi.fn((raw: string) =>
    raw.includes("invalid") ? null : "393331234567",
  ),
  maskWhatsAppToDigits: vi.fn((d: string) => d),
  sendWhatsAppTemplateMessage: vi.fn(),
}));

import { sendWhatsAppTemplateMessage } from "@/lib/integrations/whatsappGraph";
import { sendClaimOtpWhatsApp } from "@/lib/integrations/whatsappClaimOtp";

const envBackup = { ...process.env };

describe("sendClaimOtpWhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...envBackup,
      WHATSAPP_ACCESS_TOKEN: "test-token",
      WHATSAPP_PHONE_NUMBER_ID: "999",
      WHATSAPP_OTP_TEMPLATE_NAME: "customer_otp_it",
      WHATSAPP_OTP_TEMPLATE_LANG: "it",
    };
    delete process.env.CUSTOMER_CLAIM_WHATSAPP_ALLOW_SKIP;
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("con delivery obbligatorio e env mancanti → errore non skipped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.CUSTOMER_CLAIM_WHATSAPP_ALLOW_SKIP;
    delete process.env.WHATSAPP_ACCESS_TOKEN;

    const r = await sendClaimOtpWhatsApp({
      phoneRaw: "3895817411",
      otpDigits: "123456",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("whatsapp_not_configured");
    expect(sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
  });

  it("success invoca Meta template", async () => {
    vi.mocked(sendWhatsAppTemplateMessage).mockResolvedValueOnce({
      ok: true,
      providerMessageId: "wamid.abc",
    });

    const r = await sendClaimOtpWhatsApp({
      phoneRaw: "3895817411",
      otpDigits: "123456",
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect("skipped" in r && r.skipped).not.toBe(true);
    expect(sendWhatsAppTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        toDigits: "393331234567",
        templateName: "customer_otp_it",
        bodyParameters: ["123456"],
      }),
      "claim-otp",
    );
  });

  it("dev con ALLOW_SKIP e env mancanti → skipped", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.CUSTOMER_CLAIM_WHATSAPP_ALLOW_SKIP = "true";
    delete process.env.WHATSAPP_ACCESS_TOKEN;

    const r = await sendClaimOtpWhatsApp({
      phoneRaw: "3895817411",
      otpDigits: "123456",
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skipped).toBe(true);
  });
});
