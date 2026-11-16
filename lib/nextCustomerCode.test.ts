import { describe, expect, it, vi } from "vitest";
import { allocateNextCustomerCode, insertCustomerWithAllocatedCode } from "./nextCustomerCode";

describe("customer code allocation", () => {
  it("reads the highest code without scanning a capped customer list", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ customer_code: "CLI-012408" }], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const like = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ like });
    const db = { from: vi.fn().mockReturnValue({ select }) };

    expect(await allocateNextCustomerCode(db as never)).toBe("CLI-012409");
    expect(order).toHaveBeenCalledWith("customer_code", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("re-reads the latest code after a concurrent code collision", async () => {
    let latest = 12408;
    const limit = vi.fn().mockImplementation(async () => ({
      data: [{ customer_code: `CLI-${String(latest).padStart(6, "0")}` }], error: null,
    }));
    const select = vi.fn((columns: string) => columns === "customer_code"
      ? { like: () => ({ order: () => ({ limit }) }) }
      : { single: async () => ({ data: { id: "new-customer", customer_code: "CLI-012410" }, error: null }) });
    const insert = vi.fn().mockImplementation((row: { customer_code: string }) => {
      if (row.customer_code === "CLI-012409") {
        latest = 12409;
        return { select: () => ({ single: async () => ({
          data: null, error: { code: "23505", message: "customers_customer_code_key" },
        }) }) };
      }
      return { select: () => ({ single: async () => ({ data: { id: "new-customer", ...row }, error: null }) }) };
    });
    const db = { from: () => ({ select, insert }) };

    const result = await insertCustomerWithAllocatedCode(db as never, {
      first_name: "Test", last_name: "Cliente", phone: "0000000000",
    });
    expect(result.error).toBeNull();
    expect(insert.mock.calls.map(([row]) => row.customer_code)).toEqual(["CLI-012409", "CLI-012410"]);
    expect(limit).toHaveBeenCalledTimes(2);
  });
});
