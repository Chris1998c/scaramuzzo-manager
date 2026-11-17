/** Riga LAV002 per Report → Team: solo nominativo/codice BOSS, niente staff_id. */
export type BossLav002TeamRow = {
  id: number;
  boss_name: string;
  boss_code: string;
  /** Totale complessivo del file (IVA incl.), non del filtro Dal/Al. */
  file_amount_gross: number;
  period_confirmed: boolean;
};
