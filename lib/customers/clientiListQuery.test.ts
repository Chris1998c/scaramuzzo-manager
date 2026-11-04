import { describe, expect, it } from "vitest";
import { isCustomerSearchAborted } from "@/lib/customers/clientiListQuery";
import { CUSTOMER_SERVER_DEBOUNCE_MS } from "@/lib/customers/customerSearchCache";

describe("CUSTOMER_SERVER_DEBOUNCE_MS", () => {
  it("usa debounce ~300ms per ridurre richieste intermediate", () => {
    expect(CUSTOMER_SERVER_DEBOUNCE_MS).toBe(300);
  });
});

describe("isCustomerSearchAborted", () => {
  it("riconosce signal.aborted", () => {
    const c = new AbortController();
    c.abort();
    expect(isCustomerSearchAborted(c.signal, null)).toBe(true);
  });

  it("riconosce AbortError dal client supabase senza trattarlo come errore UI", () => {
    expect(
      isCustomerSearchAborted(undefined, {
        message: "AbortError: The user aborted a request.",
      }),
    ).toBe(true);
  });

  it("non confonde errori reali con abort", () => {
    expect(
      isCustomerSearchAborted(undefined, { message: "permission denied for table customers" }),
    ).toBe(false);
    expect(isCustomerSearchAborted(undefined, null)).toBe(false);
  });
});
