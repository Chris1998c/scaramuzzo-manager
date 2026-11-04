/**
 * Testo da mostrare nel campo ricerca cliente quando cambiano selezione o etichetta dal genitore.
 * Restituisce `null` se il cambio di ID è l'eco di una selezione fatta nel campo stesso:
 * in quel caso il testo scelto dall'utente va mantenuto.
 */
export function resolveCustomerFieldLabel(args: {
  selectedCustomerId: string;
  initialDisplayLabel: string;
  pickedCustomerId: string | null;
}): string | null {
  const id = String(args.selectedCustomerId ?? "");
  if (id && id === args.pickedCustomerId) return null;
  const label = String(args.initialDisplayLabel ?? "").trim();
  return id && label ? label : "";
}
