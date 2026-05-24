import { describe, expect, it } from "vitest";

import { parseCustomerAppSalonId } from "./salonValidation";

describe("parseCustomerAppSalonId", () => {
  it("accetta saloni operativi 1-4", () => {
    expect(parseCustomerAppSalonId("1")).toBe(1);
    expect(parseCustomerAppSalonId(4)).toBe(4);
  });

  it("rifiuta magazzino centrale e id non validi", () => {
    expect(parseCustomerAppSalonId("5")).toBeNull();
    expect(parseCustomerAppSalonId(0)).toBeNull();
    expect(parseCustomerAppSalonId("x")).toBeNull();
    expect(parseCustomerAppSalonId(null)).toBeNull();
  });
});
