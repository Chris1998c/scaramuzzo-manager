/**
 * KPI monetari da righe vendita (report_rows).
 *
 * Terminologia:
 * - **Reale** = dopo sconto riga (`line_total_gross` / `line_net`)
 * - **Pieno** = prezzo listino × qty, prima sconto
 * - **Sconto** = differenza pieno − reale (o `item_discount` lordo)
 *
 * Fallback IVA: se `vat_rate` manca, il netto pieno/sconto netto si deriva da
 * `full_gross - line_total_gross` ripartito proporzionalmente al netto reale.
 */

export type ReportLineInput = {
  price: number;
  quantity: number;
  item_discount: number;
  line_total_gross: number;
  line_net: number;
  line_vat?: number;
  vat_rate?: number | null;
};

export type MoneyTriple = {
  /** Incasso / valore effettivo */
  real: number;
  /** Valore listino senza sconti */
  full: number;
  /** Sconti applicati (pieno − reale) */
  discount: number;
};

export type VatDisplayMode = "gross" | "net";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Lordo pieno = prezzo unitario × quantità (prima sconto). */
export function lineFullGross(line: ReportLineInput): number {
  return roundMoney(n(line.price) * n(line.quantity));
}

/** Netto pieno: lordo pieno scorporato IVA quando `vat_rate` > 0. */
export function lineFullNet(line: ReportLineInput): number {
  const fullGross = lineFullGross(line);
  const vatRate = n(line.vat_rate);
  if (vatRate > 0) {
    return roundMoney(fullGross / (1 + vatRate / 100));
  }
  // Fallback: se abbiamo rapporto net/gross sulla riga reale, applicalo al pieno
  const realGross = n(line.line_total_gross);
  const realNet = n(line.line_net);
  if (realGross > 0 && realNet > 0 && realNet <= realGross) {
    return roundMoney(fullGross * (realNet / realGross));
  }
  return fullGross;
}

export function lineRealGross(line: ReportLineInput): number {
  return roundMoney(n(line.line_total_gross));
}

export function lineRealNet(line: ReportLineInput): number {
  return roundMoney(n(line.line_net));
}

export function lineDiscountGross(line: ReportLineInput): number {
  const explicit = n(line.item_discount);
  if (explicit > 0) return roundMoney(explicit);
  return roundMoney(Math.max(0, lineFullGross(line) - lineRealGross(line)));
}

export function lineDiscountNet(line: ReportLineInput): number {
  const vatRate = n(line.vat_rate);
  const discGross = lineDiscountGross(line);
  if (vatRate > 0) {
    return roundMoney(discGross / (1 + vatRate / 100));
  }
  return roundMoney(Math.max(0, lineFullNet(line) - lineRealNet(line)));
}

/** Bundle con/senza IVA per una singola riga. */
export function lineMoneyTriple(line: ReportLineInput): {
  gross: MoneyTriple;
  net: MoneyTriple;
} {
  const gross: MoneyTriple = {
    real: lineRealGross(line),
    full: lineFullGross(line),
    discount: lineDiscountGross(line),
  };
  const netTriple: MoneyTriple = {
    real: lineRealNet(line),
    full: lineFullNet(line),
    discount: lineDiscountNet(line),
  };
  return { gross, net: netTriple };
}

export function pickMoneyTriple(
  bundle: { gross: MoneyTriple; net: MoneyTriple },
  mode: VatDisplayMode,
): MoneyTriple {
  return mode === "gross" ? bundle.gross : bundle.net;
}

export function aggregateMoneyTriples(
  lines: ReportLineInput[],
): { gross: MoneyTriple; net: MoneyTriple } {
  let realG = 0;
  let fullG = 0;
  let discG = 0;
  let realN = 0;
  let fullN = 0;
  let discN = 0;

  for (const line of lines) {
    const t = lineMoneyTriple(line);
    realG += t.gross.real;
    fullG += t.gross.full;
    discG += t.gross.discount;
    realN += t.net.real;
    fullN += t.net.full;
    discN += t.net.discount;
  }

  return {
    gross: {
      real: roundMoney(realG),
      full: roundMoney(fullG),
      discount: roundMoney(discG),
    },
    net: {
      real: roundMoney(realN),
      full: roundMoney(fullN),
      discount: roundMoney(discN),
    },
  };
}

export function discountPercent(full: number, discount: number): number {
  if (!Number.isFinite(full) || full <= 0) return 0;
  return roundMoney((discount / full) * 100);
}

export function avgTicket(total: number, receipts: number): number {
  if (!receipts || receipts <= 0) return 0;
  return roundMoney(total / receipts);
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return roundMoney(((current - previous) / previous) * 100);
}
