import { describe, expect, it } from "vitest";

import { mergeStaffSalonIds } from "@/lib/mobile/mobileStaffSalons";

describe("mobileStaffSalons", () => {
  it("mergeStaffSalonIds include primario e junction", () => {
    expect(mergeStaffSalonIds(1, [3, 2, 1])).toEqual([1, 2, 3]);
  });
});
