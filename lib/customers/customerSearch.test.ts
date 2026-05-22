import { describe, expect, it } from "vitest";
import {
  customerMatchesSearch,
  normalizeCustomerSearchValue,
  normalizePhoneSearch,
} from "./customerSearch";

const mariellaPetrone = {
  first_name: "Mariella",
  last_name: "Petrone",
  phone: "+39 333-1234567",
  customer_code: "SCZ-0042",
  email: "mariella.petrone@example.com",
};

describe("normalizeCustomerSearchValue", () => {
  it("rimuove accenti e collassa spazi", () => {
    expect(normalizeCustomerSearchValue("  MARIÈLLA   PETRÒNE  ")).toBe(
      "mariella petrone",
    );
  });
});

describe("normalizePhoneSearch", () => {
  it("estrae solo cifre", () => {
    expect(normalizePhoneSearch("+39 333-123 4567")).toBe("393331234567");
  });
});

describe("customerMatchesSearch", () => {
  it("match nome singolo", () => {
    expect(customerMatchesSearch(mariellaPetrone, "mariella")).toBe(true);
    expect(customerMatchesSearch(mariellaPetrone, "petrone")).toBe(true);
  });

  it("match nome e cognome in ordine naturale", () => {
    expect(customerMatchesSearch(mariellaPetrone, "mariella petrone")).toBe(true);
  });

  it("match cognome e nome invertiti", () => {
    expect(customerMatchesSearch(mariellaPetrone, "petrone mariella")).toBe(true);
  });

  it("match con accenti e maiuscole", () => {
    expect(customerMatchesSearch(mariellaPetrone, "MARIÈLLA PETRÒNE")).toBe(true);
  });

  it("match telefono con prefisso e trattini", () => {
    expect(customerMatchesSearch(mariellaPetrone, "333 123")).toBe(true);
    expect(customerMatchesSearch(mariellaPetrone, "+39-333")).toBe(true);
  });

  it("match customer_code case-insensitive", () => {
    expect(customerMatchesSearch(mariellaPetrone, "scz-0042")).toBe(true);
    expect(customerMatchesSearch(mariellaPetrone, "SCZ-0042")).toBe(true);
  });

  it("match email parziale", () => {
    expect(customerMatchesSearch(mariellaPetrone, "petrone@example")).toBe(true);
  });

  it("non match su stringa irrilevante", () => {
    expect(customerMatchesSearch(mariellaPetrone, "rossi")).toBe(false);
  });
});
