/** Messaggi auth per l’UI: italiano chiaro, senza testo grezzo Supabase. */

type AuthUiContext = "login" | "reset_email" | "update_password";

type AuthLikeError = {
  message?: string;
  status?: number;
  code?: string;
} | null;

export function authUserFacingMessage(
  error: AuthLikeError | undefined,
  context: AuthUiContext,
): string {
  const raw = String(error?.message ?? "").trim();
  const code = String(error?.code ?? "").trim();
  console.error(`[auth:${context}]`, {
    message: raw || null,
    code: code || null,
    status: error?.status ?? null,
  });

  const lower = raw.toLowerCase();

  if (context === "login") {
    if (
      lower.includes("invalid login") ||
      lower.includes("invalid credentials") ||
      code === "invalid_credentials"
    ) {
      return "Email o password non corretti.";
    }
    if (lower.includes("email not confirmed") || code === "email_not_confirmed") {
      return "Conferma l’email prima di accedere.";
    }
    if (lower.includes("too many") || lower.includes("rate limit") || code === "over_request_rate_limit") {
      return "Troppi tentativi. Riprova tra poco.";
    }
    return "Accesso non riuscito. Riprova o usa «Password dimenticata?».";
  }

  if (context === "reset_email") {
    if (lower.includes("rate") || code === "over_email_send_rate_limit") {
      return "Troppe richieste. Riprova tra poco.";
    }
    return "Non è stato possibile inviare l’email. Riprova più tardi.";
  }

  // update_password
  if (lower.includes("same password") || lower.includes("should be different")) {
    return "Scegli una password diversa da quella attuale.";
  }
  if (lower.includes("weak") || (lower.includes("password") && lower.includes("least"))) {
    return "Password non valida. Usa almeno 6 caratteri.";
  }
  if (lower.includes("session") || lower.includes("jwt") || lower.includes("expired")) {
    return "Link non valido o scaduto. Rifai «Password dimenticata?» dal login.";
  }
  return "Aggiornamento password non riuscito. Richiedi un nuovo link dal login.";
}
