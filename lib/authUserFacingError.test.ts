import { describe, expect, it, vi, afterEach } from "vitest";
import { authUserFacingMessage } from "./authUserFacingError";

describe("authUserFacingMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("login: credenziali non valide in italiano, senza testo grezzo", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const msg = authUserFacingMessage(
      { message: "Invalid login credentials", status: 400 },
      "login",
    );
    expect(msg).toBe("Email o password non corretti.");
    expect(msg.toLowerCase()).not.toContain("invalid");
    expect(spy).toHaveBeenCalled();
  });

  it("reset_email: non espone messaggio grezzo", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const msg = authUserFacingMessage(
      { message: "Error sending recovery email" },
      "reset_email",
    );
    expect(msg).toBe("Non è stato possibile inviare l’email. Riprova più tardi.");
  });

  it("update_password: sessione scaduta", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const msg = authUserFacingMessage(
      { message: "Auth session missing" },
      "update_password",
    );
    expect(msg).toMatch(/Link non valido o scaduto/);
  });
});
