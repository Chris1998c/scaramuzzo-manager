import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Accesso fuori salone: la RPC non filtra per salone (solo service_role).
 * Il gate resta sulla route Next PATCH appointments/[id].
 */
describe("appointment patch salon gate (static)", () => {
  const route = readFileSync(
    join(process.cwd(), "app/api/agenda/appointments/[id]/route.ts"),
    "utf8",
  );

  it("PATCH enforces salon gate before atomic RPC write", () => {
    const patchFn = route.slice(route.indexOf("export async function PATCH"));
    const putFnStart = patchFn.indexOf("export async function PUT");
    const patchOnly = putFnStart > 0 ? patchFn.slice(0, putFnStart) : patchFn;

    expect(patchOnly).toMatch(/salon_id non consentito/);
    expect(patchOnly).toMatch(/allowedSalonIds/);
    expect(patchOnly).toMatch(/patchAppointmentServiceLinesAtomic/);

    const salonIdx = patchOnly.indexOf("salon_id non consentito");
    const rpcCallIdx = patchOnly.indexOf("await patchAppointmentServiceLinesAtomic");
    expect(salonIdx).toBeGreaterThan(0);
    expect(rpcCallIdx).toBeGreaterThan(0);
    expect(salonIdx).toBeLessThan(rpcCallIdx);
  });
});
