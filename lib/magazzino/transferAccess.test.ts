import { describe, expect, it } from "vitest";
import { canTransferBetweenSalons } from "@/lib/magazzino/transferAccess";

describe("canTransferBetweenSalons", () => {
  it("magazzino[5] can ship 5→1..4 without destination in allowedSalonIds", () => {
    expect(
      canTransferBetweenSalons({
        role: "magazzino",
        allowedSalonIds: [5],
        fromSalon: 5,
        toSalon: 1,
      }),
    ).toBe(true);
    expect(
      canTransferBetweenSalons({
        role: "magazzino",
        allowedSalonIds: [5],
        fromSalon: 5,
        toSalon: 4,
      }),
    ).toBe(true);
  });

  it("magazzino[5] cannot ship from a salon it does not own", () => {
    expect(
      canTransferBetweenSalons({
        role: "magazzino",
        allowedSalonIds: [5],
        fromSalon: 1,
        toSalon: 2,
      }),
    ).toBe(false);
  });

  it("magazzino cannot target centrale or same salon", () => {
    expect(
      canTransferBetweenSalons({
        role: "magazzino",
        allowedSalonIds: [5],
        fromSalon: 5,
        toSalon: 5,
      }),
    ).toBe(false);
  });

  it("coordinator needs both ends allowed", () => {
    expect(
      canTransferBetweenSalons({
        role: "coordinator",
        allowedSalonIds: [1, 2, 3, 4, 5],
        fromSalon: 5,
        toSalon: 2,
      }),
    ).toBe(true);
    expect(
      canTransferBetweenSalons({
        role: "coordinator",
        allowedSalonIds: [5],
        fromSalon: 5,
        toSalon: 2,
      }),
    ).toBe(false);
  });

  it("reception is not authorized by this helper", () => {
    expect(
      canTransferBetweenSalons({
        role: "reception",
        allowedSalonIds: [1],
        fromSalon: 1,
        toSalon: 2,
      }),
    ).toBe(false);
  });
});
