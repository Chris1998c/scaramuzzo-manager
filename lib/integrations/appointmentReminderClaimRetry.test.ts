import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { claimAppointmentReminderRetry } from "@/lib/integrations/appointmentReminderProcessor";

describe("claimAppointmentReminderRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restituisce null se un altro worker ha già claimato", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const sb = {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          select: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    } as unknown as SupabaseClient;

    // Chain needs all eq/is/lte/lt to return the same chain object ending in select
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.select = vi.fn(() => ({ maybeSingle }));
    (sb.from as ReturnType<typeof vi.fn>).mockReturnValue({
      update: vi.fn(() => chain),
    });

    const r = await claimAppointmentReminderRetry(
      sb,
      { appointment_id: 1, retry_count: 0 },
      new Date("2026-11-05T12:00:00.000Z"),
    );
    expect(r).toBeNull();
  });

  it("restituisce la riga se il claim atomico riesce", async () => {
    const row = {
      appointment_id: 7,
      salon_id: 1,
      customer_id: "c",
      scheduled_for: "2026-11-06T10:00:00.000Z",
      phone: "393895817411",
      template_name: "appointment_reminder",
      retry_count: 0,
      provider_message_id: null,
    };
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.select = vi.fn(() => ({ maybeSingle }));
    const sb = {
      from: vi.fn(() => ({
        update: vi.fn(() => chain),
      })),
    } as unknown as SupabaseClient;

    const r = await claimAppointmentReminderRetry(
      sb,
      { appointment_id: 7, retry_count: 0 },
      new Date("2026-11-05T12:00:00.000Z"),
    );
    expect(r).toEqual(row);
  });
});
