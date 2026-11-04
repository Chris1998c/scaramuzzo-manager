import { describe, expect, it } from "vitest";
import { resolveCustomerFieldLabel } from "@/lib/customers/customerSearchFieldLabel";

describe("resolveCustomerFieldLabel", () => {
  it("creazione: dopo la selezione nel campo il testo scelto resta (nessun reset a vuoto)", () => {
    expect(
      resolveCustomerFieldLabel({
        selectedCustomerId: "42",
        initialDisplayLabel: "",
        pickedCustomerId: "42",
      }),
    ).toBeNull();
  });

  it("modifica: mostra inizialmente il cliente dell'appuntamento", () => {
    expect(
      resolveCustomerFieldLabel({
        selectedCustomerId: "7",
        initialDisplayLabel: "  Mario Rossi ",
        pickedCustomerId: null,
      }),
    ).toBe("Mario Rossi");
  });

  it("modifica: scegliendo un altro cliente non torna al cliente originale", () => {
    expect(
      resolveCustomerFieldLabel({
        selectedCustomerId: "9",
        initialDisplayLabel: "Mario Rossi",
        pickedCustomerId: "9",
      }),
    ).toBeNull();
  });

  it("selezione cancellata dal genitore: campo vuoto", () => {
    expect(
      resolveCustomerFieldLabel({
        selectedCustomerId: "",
        initialDisplayLabel: "Mario Rossi",
        pickedCustomerId: "9",
      }),
    ).toBe("");
  });

  it("cambio appuntamento con altro cliente: mostra la nuova etichetta", () => {
    expect(
      resolveCustomerFieldLabel({
        selectedCustomerId: "11",
        initialDisplayLabel: "Laura Bianchi",
        pickedCustomerId: "9",
      }),
    ).toBe("Laura Bianchi");
  });

  it("creazione all'apertura: nessuna selezione, campo vuoto", () => {
    expect(
      resolveCustomerFieldLabel({
        selectedCustomerId: "",
        initialDisplayLabel: "",
        pickedCustomerId: null,
      }),
    ).toBe("");
  });
});
