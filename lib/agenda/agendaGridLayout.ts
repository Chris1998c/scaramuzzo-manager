/**
 * Larghezza della scrollbar verticale (offsetWidth − clientWidth).
 * L'Agenda allinea header/corpo con padding fisso 6px (= `.custom-scrollbar`);
 * questa helper resta disponibile per misure/diagnostica.
 */
export function verticalScrollbarWidth(
  el: Pick<HTMLElement, "offsetWidth" | "clientWidth"> | null | undefined,
): number {
  if (!el) return 0;
  const w = el.offsetWidth - el.clientWidth;
  return Number.isFinite(w) && w > 0 ? Math.round(w) : 0;
}
