import { describe, expect, it } from "vitest";
import {
  nextReportSalonQueryId,
  resolveClientReportSalonId,
} from "./reportSalonQuerySync";

describe("nextReportSalonQueryId", () => {
  it("scrive Cosenza quando URL è ancora Roma", () => {
    expect(nextReportSalonQueryId(4, "1")).toBe("4");
  });

  it("non riscrive se già allineato", () => {
    expect(nextReportSalonQueryId(4, "4")).toBeNull();
  });

  it("ignora active assente", () => {
    expect(nextReportSalonQueryId(null, "1")).toBeNull();
  });
});

describe("resolveClientReportSalonId", () => {
  it("preferisce query URL al prop server (evita export su Roma dopo cambio Cosenza)", () => {
    expect(resolveClientReportSalonId("4", 1)).toBe(4);
  });

  it("fallback al server se query assente", () => {
    expect(resolveClientReportSalonId(null, 1)).toBe(1);
  });
});
