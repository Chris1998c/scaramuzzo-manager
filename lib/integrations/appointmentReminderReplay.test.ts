import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyWhatsAppDeliveryStatus,
  replayDeliveryEventsForMessage,
} from "@/lib/integrations/appointmentReminderProcessor";

describe("early webhook + replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("conserva evento early (unknown_message) senza perderlo", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_webhook_events") {
          return { insert };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle })),
          })),
        };
      }),
    } as unknown as SupabaseClient;

    const r = await applyWhatsAppDeliveryStatus(sb, {
      providerMessageId: "wamid.early",
      deliveryStatus: "delivered",
      providerTimestamp: "50",
      errorMessage: null,
    });
    expect(r).toEqual({ applied: false, reason: "unknown_message" });
    expect(insert).toHaveBeenCalled();
  });

  it("replay applica delivered early dopo il salvataggio wamid", async () => {
    const updateEq2 = vi.fn(async () => ({ error: null }));
    const reminderMaybe = vi.fn(async () => ({
      data: { appointment_id: 9, delivery_status: null },
      error: null,
    }));
    const eventsEq = vi.fn(async () => ({
      data: [
        {
          delivery_status: "sent",
          provider_timestamp: "10",
          error_message: null,
        },
        {
          delivery_status: "delivered",
          provider_timestamp: "20",
          error_message: null,
        },
      ],
      error: null,
    }));

    const sb = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_webhook_events") {
          return {
            select: vi.fn(() => ({
              eq: eventsEq,
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: reminderMaybe })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: updateEq2,
            })),
          })),
        };
      }),
    } as unknown as SupabaseClient;

    await replayDeliveryEventsForMessage(sb, "wamid.early");
    expect(updateEq2).toHaveBeenCalledTimes(2);
  });
});
