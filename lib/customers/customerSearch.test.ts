import { describe, expect, it } from "vitest";
import {
  customerMatchesSearch,
  customerSearchIlikeContainsPattern,
  normalizeCustomerSearchApostrophes,
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

  it("unifica apostrofo tipografico e ASCII", () => {
    expect(normalizeCustomerSearchValue("alda d\u2019eusanio")).toBe(
      "alda d'eusanio",
    );
    expect(normalizeCustomerSearchValue("alda d'eusanio")).toBe("alda d'eusanio");
    expect(normalizeCustomerSearchApostrophes("D\u2018Eusanio")).toBe("D'Eusanio");
  });
});

describe("customerSearchIlikeContainsPattern", () => {
  it("usa _ al posto dell'apostrofo per matchare ASCII o tipografico nel DB", () => {
    expect(customerSearchIlikeContainsPattern("d'eusanio")).toBe("%d_eusanio%");
    expect(customerSearchIlikeContainsPattern("d\u2019eusanio")).toBe("%d_eusanio%");
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

  it("Alda D'Eusanio: query tipografica vs cognome ASCII in anagrafica", () => {
    const row = {
      first_name: "Alda",
      last_name: "D'Eusanio",
      phone: "",
      customer_code: "x",
    };
    expect(customerMatchesSearch(row, "alda d'eusanio")).toBe(true);
    expect(customerMatchesSearch(row, "alda d\u2019eusanio")).toBe(true);
  });

  it("Alda D'Eusanio: query ASCII vs cognome tipografico in anagrafica", () => {
    const row = {
      first_name: "Alda",
      last_name: "D\u2019Eusanio",
      phone: "",
      customer_code: "x",
    };
    expect(customerMatchesSearch(row, "alda d'eusanio")).toBe(true);
    expect(customerMatchesSearch(row, "alda d\u2019eusanio")).toBe(true);
  });
});
