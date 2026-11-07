/** Dichiarato = closing_cash; NULL = conteggio non rilevato (mai collassare a 0). */
export function resolveCashDeclaredAndDiff(args: {
  closingCash: unknown;
  openingCash: unknown;
  grossCash: number;
}): { declared_cash: number | null; cash_difference: number | null } {
  const raw = args.closingCash;
  const hasDeclared =
    raw != null && raw !== "" && Number.isFinite(Number(raw));
  if (!hasDeclared) {
    return { declared_cash: null, cash_difference: null };
  }
  const declared = Number(raw);
  const opening = Number(args.openingCash);
  const open = Number.isFinite(opening) ? opening : 0;
  const cash = Number.isFinite(args.grossCash) ? args.grossCash : 0;
  const diff =
    Math.round((declared - (open + cash) + Number.EPSILON) * 100) / 100;
  return { declared_cash: declared, cash_difference: diff };
}
