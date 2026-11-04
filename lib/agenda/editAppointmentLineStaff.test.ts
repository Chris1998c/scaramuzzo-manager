import { describe, expect, it } from "vitest";
import {
  collectChangedLineStaffPatches,
  formatLineStaffSaveFailureMessage,
  seedLineStaffDraft,
} from "./editAppointmentLineStaff";

describe("seedLineStaffDraft", () => {
  it("mappa staff_id numerico e null (non assegnato)", () => {
    expect(
      seedLineStaffDraft([
        { id: 10, staff_id: 56, name: "Taglio" },
        { id: 11, staff_id: null, name: "Piega" },
      ]),
    ).toEqual({ "10": "56", "11": null });
  });

  it("ignora id non validi", () => {
    expect(seedLineStaffDraft([{ id: "", staff_id: 1 }])).toEqual({});
  });
});

describe("collectChangedLineStaffPatches", () => {
  const lines = [
    { id: 10, staff_id: 56, name: "Taglio" },
    { id: 11, staff_id: 56, name: "Piega" },
    { id: 12, staff_id: null, name: "Colore" },
  ];

  it("non emette patch se il draft coincide col server", () => {
    expect(
      collectChangedLineStaffPatches({
        lines,
        draftByLineId: { "10": "56", "11": "56", "12": null },
      }),
    ).toEqual([]);
  });

  it("emette solo le righe con collaboratore diverso (stesso collaboratore → due servizi)", () => {
    expect(
      collectChangedLineStaffPatches({
        lines,
        draftByLineId: { "10": "56", "11": "70", "12": null },
      }),
    ).toEqual([{ lineId: 11, staff_id: 70, serviceName: "Piega" }]);
  });

  it("supporta assegnazioni miste e non assegnato", () => {
    expect(
      collectChangedLineStaffPatches({
        lines,
        draftByLineId: { "10": "70", "11": "80", "12": "56" },
      }),
    ).toEqual([
      { lineId: 10, staff_id: 70, serviceName: "Taglio" },
      { lineId: 11, staff_id: 80, serviceName: "Piega" },
      { lineId: 12, staff_id: 56, serviceName: "Colore" },
    ]);
  });

  it("può azzerare lo staff (null) su una riga", () => {
    expect(
      collectChangedLineStaffPatches({
        lines,
        draftByLineId: { "10": null, "11": "56", "12": null },
      }),
    ).toEqual([{ lineId: 10, staff_id: null, serviceName: "Taglio" }]);
  });

  it("ignora chiavi draft assenti (non inventa patch)", () => {
    expect(
      collectChangedLineStaffPatches({
        lines,
        draftByLineId: { "10": "99" },
      }),
    ).toEqual([{ lineId: 10, staff_id: 99, serviceName: "Taglio" }]);
  });
});

describe("formatLineStaffSaveFailureMessage", () => {
  it("elenca successi, fallimento e rimanenti senza fingere salvataggio completo", () => {
    const msg = formatLineStaffSaveFailureMessage({
      succeeded: [{ serviceName: "Taglio" }],
      failedServiceName: "Piega",
      failedMessage: "Slot occupato",
      remainingCount: 1,
    });
    expect(msg).toContain("Taglio");
    expect(msg).toContain("Piega");
    expect(msg).toContain("Slot occupato");
    expect(msg).toContain("1 altra modifica non inviata");
    expect(msg).toContain("Ricarica i dati dal server");
  });

  it("funziona anche senza successi precedenti", () => {
    const msg = formatLineStaffSaveFailureMessage({
      succeeded: [],
      failedServiceName: "Taglio",
      failedMessage: "Non autorizzato",
      remainingCount: 0,
    });
    expect(msg).toContain("Non aggiornato: Taglio");
    expect(msg).not.toContain("Collaboratore aggiornato");
  });
});
