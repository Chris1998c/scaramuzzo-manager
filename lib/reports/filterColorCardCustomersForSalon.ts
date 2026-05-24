/**
 * Filtra clienti con scheda colore: card salon-specific sempre;
 * card globali (salon_id null) solo se il cliente ha attività nel salone.
 */
export function filterColorCardCustomerIds(input: {
  cards: Array<{ customer_id: string; salon_id: number | null }>;
  salonId: number;
  customersActiveInSalon: Set<string>;
}): Set<string> {
  const eligible = new Set<string>();

  for (const card of input.cards) {
    const cid = String(card.customer_id ?? "").trim();
    if (!cid) continue;

    const cardSalonId = card.salon_id;
    if (cardSalonId != null && Number(cardSalonId) === input.salonId) {
      eligible.add(cid);
      continue;
    }

    if (cardSalonId == null && input.customersActiveInSalon.has(cid)) {
      eligible.add(cid);
    }
  }

  return eligible;
}
