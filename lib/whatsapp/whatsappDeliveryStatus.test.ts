import { describe, expect, it } from "vitest";

import {
  parseWhatsAppStatusEvents,
  shouldApplyDeliveryStatus,
} from "@/lib/whatsapp/whatsappDeliveryStatus";

describe("shouldApplyDeliveryStatus", () => {
  it("applica il primo stato e ignora duplicati", () => {
    expect(shouldApplyDeliveryStatus(null, "sent")).toBe(true);
    expect(shouldApplyDeliveryStatus("sent", "sent")).toBe(false);
  });

  it("avanza monotono e rifiuta fuori ordine", () => {
    expect(shouldApplyDeliveryStatus("sent", "delivered")).toBe(true);
    expect(shouldApplyDeliveryStatus("delivered", "read")).toBe(true);
    expect(shouldApplyDeliveryStatus("read", "delivered")).toBe(false);
    expect(shouldApplyDeliveryStatus("delivered", "sent")).toBe(false);
  });

  it("consente failed dopo sent/delivered ma non dopo read", () => {
    expect(shouldApplyDeliveryStatus("sent", "failed")).toBe(true);
    expect(shouldApplyDeliveryStatus("delivered", "failed")).toBe(true);
    expect(shouldApplyDeliveryStatus("read", "failed")).toBe(false);
  });

  it("dopo failed consente delivered/read (retry carrier Meta), non sent", () => {
    expect(shouldApplyDeliveryStatus("failed", "delivered")).toBe(true);
    expect(shouldApplyDeliveryStatus("failed", "read")).toBe(true);
    expect(shouldApplyDeliveryStatus("failed", "sent")).toBe(false);
    expect(shouldApplyDeliveryStatus("failed", "failed")).toBe(false);
  });
});

describe("parseWhatsAppStatusEvents", () => {
  it("estrae status dal payload Meta", () => {
    const events = parseWhatsAppStatusEvents({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.1", status: "delivered", timestamp: "100" },
                  { id: "wamid.1", status: "read", timestamp: "101" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      providerMessageId: "wamid.1",
      deliveryStatus: "delivered",
      providerTimestamp: "100",
    });
  });
});
