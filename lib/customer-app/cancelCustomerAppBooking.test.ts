import { describe, expect, it, vi } from "vitest";

import {
  cancelCustomerAppBooking,
  CustomerAppBookingCancelNotFoundError,
} from "@/lib/customer-app/cancelCustomerAppBooking";

describe("cancelCustomerAppBooking ownership", () => {
  it("booking di un altro cliente (filtro customer_id) → NotFound 404", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq })),
      })),
    };

    await expect(
      cancelCustomerAppBooking(admin as never, "customer-a-uuid", 42),
    ).rejects.toBeInstanceOf(CustomerAppBookingCancelNotFoundError);

    expect(admin.from).toHaveBeenCalledWith("appointments");
    expect(eq).toHaveBeenCalledWith("id", 42);
  });
});
