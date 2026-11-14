import { describe, expect, it } from "vitest";
import { parseCustomerPushSubscription } from "./customerPushSubscription";

const good = {
  endpoint: "https://web.push.apple.com/Q123",
  keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
};

describe("customer push endpoint", () => {
  it("accepts Apple subscription", () => {
    expect(parseCustomerPushSubscription(good)?.endpoint).toBe(good.endpoint);
  });
  it.each([
    "https://127.0.0.1/private",
    "https://web.push.apple.com.evil.example/",
    "http://web.push.apple.com/",
    "https://web.push.apple.com:8443/",
  ])("rejects untrusted destination %s", (endpoint) => {
    expect(parseCustomerPushSubscription({ ...good, endpoint })).toBeNull();
  });
});
