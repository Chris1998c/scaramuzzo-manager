import type { VatDisplayMode } from "@/lib/reports/reportLineKpiMath";

/** Query export/UI: `vat_mode=gross|net` oppure `iva=con|imponibile`. */
export function parseReportVatMode(raw: string | null | undefined): VatDisplayMode {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "net" || s === "imponibile" || s === "imponibili") return "net";
  return "gross";
}

export function reportVatModeLabel(mode: VatDisplayMode): string {
  return mode === "gross" ? "Valori con IVA" : "Valori imponibili";
}

export function reportVatModeQueryValue(mode: VatDisplayMode): string {
  return mode === "gross" ? "gross" : "net";
}
