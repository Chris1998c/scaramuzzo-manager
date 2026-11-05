import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { applyWhatsAppDeliveryStatus } from "@/lib/integrations/appointmentReminderProcessor";

function mockSupabase(opts: {
  insertError?: { code?: string; message?: string } | null;
  reminder?: { appointment_id: number; delivery_status: string | null } | null;
  updateError?: { message?: string } | null;
}) {
  const updateEq = vi.fn(async () => ({ error: opts.updateError ?? null }));
  const update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: updateEq })) }));
  // update().eq(appointment_id).eq(provider_message_id)
  const updateChain = {
    eq: vi.fn(function (this: unknown, _col: string, _val: unknown) {
      // first eq returns object with second eq
      return {
        eq: updateEq,
      };
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "whatsapp_webhook_events") {
        return {
          insert: vi.fn(async () => ({ error: opts.insertError ?? null })),
        };
      }
      if (table === "appointment_whatsapp_reminders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.reminder ?? null,
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => updateChain),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    _updateEq: updateEq,
    _update: update,
  } as unknown as SupabaseClient & { _updateEq: typeof updateEq };
}

describe("applyWhatsAppDeliveryStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignora eventi webhook duplicati", async () => {
    const sb = mockSupabase({
      insertError: { code: "23505", message: "duplicate" },
    });
    const r = await applyWhatsAppDeliveryStatus(sb, {
      providerMessageId: "wamid.1",
      deliveryStatus: "delivered",
      providerTimestamp: "100",
      errorMessage: null,
    });
    expect(r).toEqual({ applied: false, reason: "duplicate_event" });
  });

  it("applica delivered e ignora poi sent fuori ordine", async () => {
    const sb = mockSupabase({
      reminder: { appointment_id: 10, delivery_status: "delivered" },
    });
    const stale = await applyWhatsAppDeliveryStatus(sb, {
      providerMessageId: "wamid.1",
      deliveryStatus: "sent",
      providerTimestamp: "99",
      errorMessage: null,
    });
    expect(stale).toEqual({ applied: false, reason: "stale_status" });
  });

  it("applica avanzamento monotono sent → delivered", async () => {
    const sb = mockSupabase({
      reminder: { appointment_id: 10, delivery_status: "sent" },
    });
    const r = await applyWhatsAppDeliveryStatus(sb, {
      providerMessageId: "wamid.1",
      deliveryStatus: "delivered",
      providerTimestamp: "101",
      errorMessage: null,
    });
    expect(r).toEqual({ applied: true });
    expect(sb._updateEq).toHaveBeenCalled();
  });
});
