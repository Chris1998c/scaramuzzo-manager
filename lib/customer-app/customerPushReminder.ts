export type PushReminderCandidate = {
  appointment_id: number;
  subscription_id: string;
  scheduled_for: string;
  salon_name: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function buildCustomerPushPayload(row: PushReminderCandidate) {
  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  }).format(new Date(row.scheduled_for));
  return {
    title: "Appuntamento Scaramuzzo domani",
    body: `Ti aspettiamo domani alle ${time}. Apri l'app per i dettagli.`,
    tag: `scaramuzzo-appointment-${row.appointment_id}`,
    url: "/app-clienti/bookings",
  };
}
