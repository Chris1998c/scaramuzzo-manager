/** Badge stato agenda (UI card/modale). */
export function agendaStatusMeta(status: string | null | undefined) {
  const s = String(status || "scheduled").trim().toLowerCase();
  if (s === "in_sala") {
    return {
      label: "In sala",
      cls: "bg-emerald-400/90 text-black",
    };
  }
  if (s === "done") {
    return {
      label: "Completato",
      cls: "bg-white/10 text-white/70",
    };
  }
  if (s === "cancelled") {
    return {
      label: "Annullato",
      cls: "bg-red-500/20 text-red-200",
    };
  }
  if (s === "no_show" || s === "noshow") {
    return {
      label: "No-show",
      cls: "bg-amber-500/20 text-amber-100",
    };
  }
  return {
    label: "Prenotato",
    cls: "bg-white/5 text-white/75",
  };
}
