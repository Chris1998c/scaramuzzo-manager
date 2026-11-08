import { describe, expect, it } from "vitest";

import { verticalScrollbarWidth } from "./agendaGridLayout";

describe("verticalScrollbarWidth", () => {
  it("restituisce 0 senza elemento o senza scrollbar", () => {
    expect(verticalScrollbarWidth(null)).toBe(0);
    expect(verticalScrollbarWidth({ offsetWidth: 100, clientWidth: 100 })).toBe(0);
    expect(verticalScrollbarWidth({ offsetWidth: 100, clientWidth: 120 })).toBe(0);
  });

  it("misura la gutter della scrollbar verticale", () => {
    expect(verticalScrollbarWidth({ offsetWidth: 1290, clientWidth: 1284 })).toBe(6);
  });
});
