import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/whatsappWebhookSignature";

describe("verifyWhatsAppWebhookSignature", () => {
  const secret = "test-app-secret";
  const body = Buffer.from('{"object":"whatsapp_business_account"}', "utf8");

  it("accetta firma HMAC valida", () => {
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(
      verifyWhatsAppWebhookSignature({
        rawBody: body,
        signatureHeader: `sha256=${hex}`,
        appSecret: secret,
      }),
    ).toBe(true);
  });

  it("rifiuta firma non valida", () => {
    expect(
      verifyWhatsAppWebhookSignature({
        rawBody: body,
        signatureHeader: `sha256=${"ab".repeat(32)}`,
        appSecret: secret,
      }),
    ).toBe(false);
  });

  it("rifiuta header assente o malformato", () => {
    expect(
      verifyWhatsAppWebhookSignature({
        rawBody: body,
        signatureHeader: null,
        appSecret: secret,
      }),
    ).toBe(false);
    expect(
      verifyWhatsAppWebhookSignature({
        rawBody: body,
        signatureHeader: "sha1=deadbeef",
        appSecret: secret,
      }),
    ).toBe(false);
  });
});

describe("verifyWhatsAppWebhookChallenge", () => {
  it("restituisce challenge se token corretto", () => {
    const r = verifyWhatsAppWebhookChallenge({
      mode: "subscribe",
      verifyToken: "verify-me",
      challenge: "12345",
      expectedVerifyToken: "verify-me",
    });
    expect(r).toEqual({ ok: true, challenge: "12345" });
  });

  it("rifiuta token errato", () => {
    expect(
      verifyWhatsAppWebhookChallenge({
        mode: "subscribe",
        verifyToken: "nope",
        challenge: "12345",
        expectedVerifyToken: "verify-me",
      }).ok,
    ).toBe(false);
  });
});
