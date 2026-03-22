export type CustomersDomainSnapshot = {
  /** ISO timestamp server quando sono stati letti i conteggi */
  fetchedAt: string;
  counts: {
    customers: number | null;
    customer_profile: number | null;
    customer_notes: number | null;
    customer_tech_notes: number | null;
    customer_technical_cards: number | null;
    technical_sheets: number | null;
    customer_service_cards: number | null;
  };
};
