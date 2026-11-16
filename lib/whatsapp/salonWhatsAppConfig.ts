export type SalonWhatsAppConfigStatus = {
  ready: boolean;
  issues: string[];
};

/** Valuta se il salone può inviare reminder / marketing (config minima). */
export function evaluateSalonWhatsAppConfig(input: {
  is_enabled?: boolean | null;
  phone_number_id?: string | null;
  appointment_reminder_enabled?: boolean | null;
  appointment_reminder_template_name?: string | null;
  envTemplateName?: string | null;
}): SalonWhatsAppConfigStatus {
  const issues: string[] = [];

  if (!input.is_enabled) {
    issues.push("Canale WhatsApp disattivato per questo salone.");
  }

  if (!String(input.phone_number_id ?? "").trim()) {
    issues.push("Manca l'ID numero Business.");
  }

  const remindersOn = input.appointment_reminder_enabled !== false;
  if (remindersOn) {
    const tpl =
      String(input.appointment_reminder_template_name ?? "").trim() ||
      String(input.envTemplateName ?? "").trim();
    if (!tpl) {
      issues.push(
        "Promemoria attivo: inserisci il nome del modello qui oppure lascia che usi quello predefinito del sistema.",
      );
    }
  }

  return { ready: issues.length === 0, issues };
}
